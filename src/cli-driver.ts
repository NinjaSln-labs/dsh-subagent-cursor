/**
 * CLI subprocess driver — spawn `cursor-agent -p --output-format stream-json`.
 *
 * Auth uses the local CLI login state (browser login); no CURSOR_API_KEY needed.
 * stdout is newline-delimited JSON events; the terminal `type:"result"` event
 * carries the final text (`result`) and `session_id`. On failure, stderr is
 * classified into the closed-set categories (never echoed raw to the parent).
 */
import { spawn } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
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
  | { readonly kind: 'finished'; readonly text: string; readonly sessionId: string; readonly rejected?: readonly string[] }
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

/** Extract a shell command rejected by the Cursor permission allowlist. */
export function extractRejectedCommand(event: CliStreamEvent): string | undefined {
  if (event.type !== 'tool_call' || event.subtype !== 'completed') return undefined
  const tc = (event as { tool_call?: unknown }).tool_call
  if (tc === null || typeof tc !== 'object') return undefined
  const shell = (tc as { shellToolCall?: unknown }).shellToolCall
  if (shell === null || typeof shell !== 'object') return undefined
  const result = (shell as { result?: unknown }).result
  if (result === null || typeof result !== 'object') return undefined
  const rejected = (result as { rejected?: unknown }).rejected
  if (rejected === null || typeof rejected !== 'object') return undefined
  const command = (rejected as { command?: unknown }).command
  return typeof command === 'string' && command.trim().length > 0 ? command.trim() : undefined
}

function classifyCliFailure(detail: string): FailureCategory {
  return classifySdkError(new Error(detail))
}

/**
 * Resolve the actual `cursor-agent` binary path.
 *
 * - Explicit absolute / relative-with-slash path → used as-is.
 * - Bare name (`cursor-agent`, default): look up PATH; when the caller is a
 *   non-interactive host process whose PATH omits the user's ~/.local/bin,
 *   fall back to the Cursor CLI install location (~/.local/bin/cursor-agent,
 *   symlinked into ~/.local/share/cursor-agent/versions/<v>/).
 */
export function resolveCliPath(cliPath: string): string {
  const candidates = [cliPath]
  if (!cliPath.includes('/')) {
    candidates.push(join(homedir(), '.local', 'bin', cliPath))
  }
  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK)
      return candidate
    } catch {
      // continue
    }
  }
  return cliPath // spawn will surface ENOENT with the original configured name
}

export type CliReadiness =
  | { readonly ready: true; readonly account: string }
  | { readonly ready: false; readonly reason: 'missing' | 'not-logged-in'; readonly detail: string }

/**
 * Check the Cursor CLI is installed AND logged in — without touching user
 * credentials. Delegates to the CLI's own `status` subcommand, which reads its
 * own auth store; we only parse its stdout (`✓ Logged in as …` / `Not logged in`).
 * A missing binary is detected via spawn ENOENT.
 */
export function checkCliReady(cliPath: string, timeoutMs = 10_000): Promise<CliReadiness> {
  const resolvedPath = resolveCliPath(cliPath)
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn> | undefined
    try {
      child = spawn(resolvedPath, ['status'], {
        stdio: ['ignore', 'pipe', 'ignore'],
        env: process.env,
      })
    } catch (error) {
      resolve({
        ready: false,
        reason: 'missing',
        detail: `无法启动 cursor-agent（${error instanceof Error ? error.message : String(error)}）`,
      })
      return
    }
    let stdout = ''
    let settled = false
    const finish = (out: CliReadiness) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(out)
    }
    child.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        finish({ ready: false, reason: 'missing', detail: resolvedPath })
      } else {
        finish({ ready: false, reason: 'missing', detail: `${resolvedPath}: ${error.message}` })
      }
    })
    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk
    })
    child.on('close', () => {
      const text = stdout.trim()
      // 「✓ Logged in as …」→ 已登录；「Not logged in」→ 未登录（注意 Not 前缀）
      const notLoggedIn = /not\s+logged\s+in/i.test(text)
      const loggedIn = !notLoggedIn && /logged\s+in/i.test(text)
      const accountMatch = /logged\s+in\s+as\s+(.+)/i.exec(text)
      if (loggedIn) {
        finish({ ready: true, account: accountMatch?.[1]?.trim() ?? 'unknown' })
      } else {
        finish({ ready: false, reason: 'not-logged-in', detail: text || '(无输出)' })
      }
    })
    const timer = setTimeout(() => {
      child?.kill('SIGKILL')
      finish({ ready: false, reason: 'not-logged-in', detail: 'cursor-agent status 超时' })
    }, timeoutMs)
  })
}

/** Production factory: spawn the CLI in print mode, stream-parse stdout. */
export const createCliRun: CreateCliRun = async (options) => {
  const resolvedPath = resolveCliPath(options.cliPath)
  const args = [
    '-p',
    '--output-format', 'stream-json',
    '--trust',
    '--model', options.model,
    options.prompt,
  ]
  const child = spawn(resolvedPath, args, {
    cwd: options.cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...options.env },
  })

  let stdoutBuffer = ''
  let stderrTail = ''
  let settled = false
  let cancelRequested = false
  let sessionId = ''
  const rejectedCommands: string[] = []
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
        const rejectedCmd = extractRejectedCommand(event)
        if (rejectedCmd !== undefined && !rejectedCommands.includes(rejectedCmd)) {
          rejectedCommands.push(rejectedCmd)
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
            settle({
              kind: 'finished',
              text: event.result ?? '',
              sessionId,
              rejected: rejectedCommands.length > 0 ? [...rejectedCommands] : undefined,
            })
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
      ? `cursor-agent executable not found at ${options.cliPath} (resolved ${resolvedPath}); install Cursor CLI or set config cliPath`
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
