/**
 * CLI subprocess driver — spawn `cursor-agent -p --output-format stream-json`.
 *
 * Auth uses the local CLI login state (browser login); no CURSOR_API_KEY needed.
 * stdout is newline-delimited JSON events; the terminal `type:"result"` event
 * carries the final text (`result`) and `session_id`. On failure, stderr is
 * classified into the closed-set categories (never echoed raw to the parent).
 */
import { spawn } from 'node:child_process'
import { classifySdkError, type FailureCategory } from './failure.ts'

/** One parsed stream-json event (subset we consume). */
export type CliStreamEvent = {
  readonly type: string
  readonly subtype?: string
  readonly result?: string
  readonly session_id?: string
  readonly is_error?: boolean
}

/** Handle shape shared with the SDK driver (wait / cancel / supports). */
export type CliRunHandle = {
  readonly sessionId: string
  wait(): Promise<CliResult>
  cancel(): Promise<void>
  supports(operation: 'cancel' | 'wait'): boolean
}

export type CliResult =
  | { readonly kind: 'finished'; readonly text: string; readonly sessionId: string }
  | { readonly kind: 'error'; readonly category: FailureCategory; readonly detail: string; readonly sessionId?: string }

export type CreateCliRunOptions = {
  readonly prompt: string
  readonly model: string
  readonly cwd: string
  readonly signal: AbortSignal
  readonly cliPath: string
  readonly timeoutMs: number
  /** Env layered over the credential-scrubbed parent env (config.env). */
  readonly env?: Record<string, string>
}

export type CreateCliRun = (options: CreateCliRunOptions) => Promise<CliRunHandle>

/** Parse one stream-json line; tolerate non-JSON noise lines. */
export function parseCliEventLine(line: string): CliStreamEvent | undefined {
  const trimmed = line.trim()
  if (trimmed.length === 0) return undefined
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (parsed !== null && typeof parsed === 'object' && 'type' in parsed) {
      return parsed as CliStreamEvent
    }
  } catch {
    // non-JSON line (progress noise) — ignore
  }
  return undefined
}

function classifyCliFailure(detail: string): FailureCategory {
  return classifySdkError(new Error(detail))
}

/** Production factory: spawn the CLI in print mode, stream-parse stdout. */
export const createCliRun: CreateCliRun = async (options) => {
  const args = [
    '-p',
    '--output-format', 'stream-json',
    '--trust',
    '--model', options.model,
    options.prompt,
  ]
  const child = spawn(options.cliPath, args, {
    cwd: options.cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...options.env },
  })

  let stdoutBuffer = ''
  let stderrTail = ''
  let settled = false
  let cancelRequested = false
  let sessionId = ''
  let resolveWait!: (value: CliResult) => void
  const waitPromise = new Promise<CliResult>((resolve) => { resolveWait = resolve })

  const timeout = setTimeout(() => {
    if (!settled) {
      child.kill('SIGTERM')
    }
  }, options.timeoutMs)

  const settle = (value: CliResult) => {
    if (settled) return
    settled = true
    clearTimeout(timeout)
    resolveWait(value)
  }

  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    stdoutBuffer += chunk
    let newlineIndex = stdoutBuffer.indexOf('\n')
    while (newlineIndex !== -1) {
      const line = stdoutBuffer.slice(0, newlineIndex)
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1)
      const event = parseCliEventLine(line)
      if (event !== undefined) {
        if (typeof event.session_id === 'string' && event.session_id.length > 0) {
          sessionId = event.session_id
        }
        if (event.type === 'result') {
          if (event.is_error === true) {
            settle({
              kind: 'error',
              category: 'sdk',
              detail: event.result?.trim() || 'cli reported is_error',
              sessionId,
            })
          } else {
            settle({ kind: 'finished', text: event.result ?? '', sessionId })
          }
        }
      }
      newlineIndex = stdoutBuffer.indexOf('\n')
    }
  })

  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk: string) => {
    stderrTail = (stderrTail + chunk).slice(-2000)
  })

  const failFromExit = (): CliResult => {
    const detail = stderrTail.trim() || `cursor-agent exited unexpectedly (code ${child.exitCode})`
    return { kind: 'error', category: classifyCliFailure(detail), detail, sessionId: sessionId || undefined }
  }

  child.on('error', (error: NodeJS.ErrnoException) => {
    const detail = error.code === 'ENOENT'
      ? `cursor-agent executable not found at ${options.cliPath}`
      : error.message
    settle({ kind: 'error', category: classifyCliFailure(detail), detail, sessionId: undefined })
  })

  child.on('close', (code, signalName) => {
    if (settled) return
    if (cancelRequested || signalName === 'SIGTERM') {
      const timedOut = !cancelRequested
      settle({
        kind: 'error',
        category: timedOut ? 'timeout' : 'cancelled',
        detail: timedOut ? `cursor-agent timed out after ${options.timeoutMs}ms` : 'run cancelled locally',
        sessionId: sessionId || undefined,
      })
    } else {
      void code
      settle(failFromExit())
    }
  })

  return {
    sessionId,
    wait: () => waitPromise,
    cancel: async () => {
      cancelRequested = true
      if (!settled) child.kill('SIGTERM')
    },
    supports: (operation) => operation === 'cancel' || operation === 'wait',
  }
}
