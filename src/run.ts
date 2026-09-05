/**
 * One-shot run driver: cwd resolve → create run (CLI or SDK) → map result →
 * SubagentRun (cancel, dispose, never-reject result after publication).
 */
import { randomUUID } from 'node:crypto'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import {
  resolveChildCwd,
  settleRunResult,
  subprocessRunHandle,
  type SubagentResult,
  type SubagentRun,
  type SubagentStartRequest,
  type SubagentStopReason,
} from '@deepseek-ai/dsh-subagent'
import type { RunResult } from '@cursor/sdk'
import { createCliRun, checkCliReady, type CliReadiness, type CliResult, type CliRunHandle, type CreateCliRun } from './cli-driver.ts'
import { classifySdkError, formatDiagnostic, type FailureStage } from './failure.ts'
import { wrapTaskPrompt } from './prompt.ts'
import { formatForParent, parseResultText } from './result-format.ts'
import { createSdkAgent, type CreateSdkAgent, type SdkAgent, type SdkRunHandle } from './sdk.ts'

const PREFIX = 'dsh-subagent-cursor'

/** Which backend executes the one-shot run. */
export type CursorDriver = 'cli' | 'sdk'

export type CursorRunDeps = {
  /** Execution backend; `cli` (local login state, no key) by default. */
  readonly driver: CursorDriver
  readonly createAgent?: CreateSdkAgent
  readonly createRun?: CreateCliRun
  readonly apiKey: string
  readonly model: string
  readonly disposeGraceMs: number
  /** cursor-agent executable path (driver=cli only). */
  readonly cliPath: string
  /** Hard wall-clock limit per one-shot run in ms (driver=cli only). */
  readonly timeoutMs: number
  /** Load-validated cwd override; omit to use parent session cwd. */
  readonly configuredCwd?: string
  /** Extra env layered over the credential-scrubbed parent env. */
  readonly env?: Record<string, string>
  readonly onError?: (error: Error, stopReason: SubagentStopReason) => void
}

/** Join text-only prompt blocks; reject empty / non-text tasks before publication. */
export function textTask(prompt: readonly ContentBlock[]): string {
  if (prompt.length === 0) {
    throw new Error(`${PREFIX}: the one-shot task must contain only text blocks`)
  }
  const texts: string[] = []
  for (const block of prompt) {
    if (block.type !== 'text') {
      throw new Error(`${PREFIX}: the one-shot task must contain only text blocks`)
    }
    texts.push(block.text)
  }
  if (texts.every((text) => text.trim().length === 0)) {
    throw new Error(`${PREFIX}: the one-shot task must not be empty`)
  }
  return texts.join('')
}

function textOutput(text: string): ContentBlock[] {
  return [{ type: 'text', text }]
}

/** 用户可读的就绪失败指引（缺装 vs 未登录，附修复命令）。 */
export function cliReadinessMessage(readiness: CliReadiness): string {
  if ('reason' in readiness && readiness.ready === false) {
    if (readiness.reason === 'missing') {
      return [
        `${PREFIX}: 找不到 cursor-agent CLI（查找路径: ${readiness.detail}）。`,
        '安装：curl https://cursor.com/install -fsS | bash   # 装到 ~/.local/bin',
        '或配置 cliPath 指向你的 cursor-agent 可执行文件。',
      ].join('\n')
    }
    return [
      `${PREFIX}: cursor-agent 未登录（${readiness.detail}）。`,
      '登录：cursor-agent login   # 浏览器授权一次即可',
      '然后重试本委派。',
    ].join('\n')
  }
  return ''
}

function mapRunResult(run: RunResult): SubagentResult {
  if (run.status === 'finished') {
    const raw = run.result ?? ''
    const formatted = formatForParent(parseResultText(raw))
    return { output: textOutput(formatted), stopReason: 'completed' }
  }
  if (run.status === 'cancelled') {
    return {
      output: textOutput(formatDiagnostic({ stage: 'query-run', category: 'cancelled', runId: run.id })),
      stopReason: 'aborted',
    }
  }
  const category = classifySdkError(run.error ?? new Error(run.result ?? 'sdk error'))
  const line = formatDiagnostic({ stage: 'query-run', category, runId: run.id })
  const detail = run.error?.message?.trim() || run.result?.trim() || 'run failed'
  return {
    output: textOutput(`${line}\n${detail}`),
    stopReason: 'error',
  }
}

function mapCliResult(result: CliResult): SubagentResult {
  if (result.kind === 'finished') {
    const formatted = formatForParent(parseResultText(result.text), 'Cursor 委派结果')
    return { output: textOutput(formatted), stopReason: 'completed' }
  }
  if (result.category === 'cancelled') {
    return {
      output: textOutput(formatDiagnostic({ stage: 'query-run', category: 'cancelled', runId: result.sessionId })),
      stopReason: 'aborted',
    }
  }
  const line = formatDiagnostic({ stage: 'query-run', category: result.category, runId: result.sessionId })
  return {
    output: textOutput(`${line}\n${result.detail}`),
    stopReason: 'error',
  }
}

async function disposeCursorAgent(
  agent: SdkAgent | undefined,
  handle: SdkRunHandle | undefined,
): Promise<void> {
  const failures: Error[] = []
  if (handle !== undefined && handle.supports('cancel')) {
    try {
      await handle.cancel()
    } catch (error) {
      failures.push(error instanceof Error ? error : new Error(String(error)))
    }
  }
  if (agent !== undefined) {
    try {
      await agent[Symbol.asyncDispose]()
    } catch (error) {
      failures.push(error instanceof Error ? error : new Error(String(error)))
    }
  }
  if (failures.length === 1) throw failures[0]
  if (failures.length > 1) {
    throw new AggregateError(failures, `${PREFIX}: agent cleanup failed`)
  }
}

/**
 * Publish one Cursor one-shot run. Pre-publication failures reject;
 * post-publication failures settle through `result` (never reject).
 *
 * driver=cli (default): spawn `cursor-agent -p` using the local login state —
 *   apiKey is NOT required. driver=sdk: `@cursor/sdk` Agent, requires apiKey.
 */
export async function startCursorRun(
  request: SubagentStartRequest,
  deps: CursorRunDeps,
): Promise<SubagentRun> {
  const userText = textTask(request.prompt)
  if (request.signal.aborted) {
    throw new Error(`${PREFIX}: request was aborted before startup`)
  }
  if (deps.driver === 'sdk') {
    const apiKey = deps.apiKey.trim()
    if (apiKey.length === 0) {
      throw new Error(`${PREFIX}: driver=sdk requires CURSOR_API_KEY / apiKey (query-start/auth); use driver=cli for local login auth`)
    }
  }

  const parentCwd = request.parent.session.header.cwd
  const cwd = resolveChildCwd(PREFIX, deps.configuredCwd, parentCwd)
  const prompt = wrapTaskPrompt(userText)

  const controller = new AbortController()
  let activeHandle: SdkRunHandle | undefined
  let activeCliRun: CliRunHandle | undefined

  const requestCancel = () => {
    if (!controller.signal.aborted) {
      controller.abort(new Error(`${PREFIX}: run cancelled locally`))
    }
    const handle = activeHandle
    if (handle !== undefined && handle.supports('cancel')) {
      void handle.cancel().catch(() => {})
    }
    const cliRun = activeCliRun
    if (cliRun !== undefined) {
      void cliRun.cancel().catch(() => {})
    }
  }
  const onAbort = () => {
    requestCancel()
  }
  request.signal.addEventListener('abort', onAbort, { once: true })

  if (deps.driver === 'cli') {
    const createRun = deps.createRun ?? createCliRun
    if (deps.createRun === undefined) {
      // 就绪检测（缺装 / 未登录 → 抛带可操作指引的错，避免黑盒失败）。
      // 仅对生产默认 createRun 执行；注入 createRun（测试/宿主替换）时信任注入者跳过。
      const readiness = await checkCliReady(deps.cliPath)
      if (!readiness.ready) {
        throw new Error(cliReadinessMessage(readiness))
      }
    }
    // spawn failures are post-publication settle material for CLI (no agent
    // object to dispose): publish immediately, let wait() surface the error.
    const cliRun = await createRun({
      prompt,
      model: deps.model,
      cwd,
      signal: request.signal,
      cliPath: deps.cliPath,
      timeoutMs: deps.timeoutMs,
      env: deps.env,
    })
    if (controller.signal.aborted || request.signal.aborted) {
      await cliRun.cancel().catch(() => {})
      throw new Error(`${PREFIX}: request was aborted before startup`)
    }
    activeCliRun = cliRun

    const result = settleRunResult({
      attempt: async () => mapCliResult(await cliRun.wait()),
      collectOutput: () => [],
      cancelled: () => controller.signal.aborted,
      onError: deps.onError,
      signal: request.signal,
      onAbort,
    })

    return subprocessRunHandle({
      id: SessionId(cliRun.sessionId.length > 0 ? cliRun.sessionId : randomUUID()),
      result,
      signal: request.signal,
      onAbort,
      requestCancel,
      teardown: async () => {},
    })
  }

  let agent: SdkAgent | undefined
  try {
    agent = await (deps.createAgent ?? createSdkAgent)({ apiKey: deps.apiKey.trim(), model: deps.model, cwd })
    if (controller.signal.aborted || request.signal.aborted) {
      throw new Error(`${PREFIX}: request was aborted before SDK startup`)
    }
    activeHandle = await agent.send(prompt)
    if (controller.signal.aborted || request.signal.aborted) {
      throw new Error(`${PREFIX}: request was aborted before SDK startup`)
    }
  } catch (error) {
    request.signal.removeEventListener('abort', onAbort)
    const cancelledBeforeCleanup = controller.signal.aborted || request.signal.aborted
    requestCancel()
    try {
      await disposeCursorAgent(agent, activeHandle)
    } catch (disposeError) {
      throw new AggregateError(
        [
          error instanceof Error ? error : new Error(String(error)),
          disposeError instanceof Error ? disposeError : new Error(String(disposeError)),
        ],
        `${PREFIX}: startup failed and cleanup also failed`,
      )
    }
    if (cancelledBeforeCleanup) {
      throw new Error(`${PREFIX}: request was aborted before SDK startup`)
    }
    throw error instanceof Error ? error : new Error(String(error))
  }

  const publishedAgent = agent
  const publishedHandle = activeHandle!

  void deps.disposeGraceMs

  const result = settleRunResult({
    attempt: async () => {
      try {
        const runResult = await publishedHandle.wait()
        return mapRunResult(runResult)
      } catch (error) {
        const stage: FailureStage = 'query-run'
        const category = classifySdkError(error)
        const line = formatDiagnostic({ stage, category })
        const message = error instanceof Error ? error.message : String(error)
        return {
          output: textOutput(`${line}\n${message}`),
          stopReason: 'error' as const,
        }
      }
    },
    collectOutput: () => [],
    cancelled: () => controller.signal.aborted,
    onError: deps.onError,
    signal: request.signal,
    onAbort,
  })

  return subprocessRunHandle({
    id: SessionId(randomUUID()),
    result,
    signal: request.signal,
    onAbort,
    requestCancel,
    teardown: () => disposeCursorAgent(publishedAgent, publishedHandle),
  })
}
