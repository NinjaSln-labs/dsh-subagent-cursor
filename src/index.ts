/**
 * dsh-subagent-cursor — Cursor product subagent for DeepSeek Harness.
 *
 * Registers a `ctx.subagents` provider (default name `cursor`). Each run is a
 * one-shot local Cursor query in the parent session cwd. Driver: `cli` (default)
 * spawns the local `cursor-agent` using its login state (no API key); `sdk`
 * uses `@cursor/sdk` with `CURSOR_API_KEY`.
 *
 * Bundle: host plane Profile Bundle — same family as official Claude Code /
 * Codex providers. Model-facing tools are separate `dsh-tool-subagent` rows.
 */
import type { Context } from '@deepseek-ai/cordis'
import { registerCursorProvider } from './provider.ts'
import type { CursorDriver } from './run.ts'

/** Plugin config; every field optional with a sane default. */
export interface CursorSubagentConfig {
  /** Registry name on `ctx.subagents` (default `cursor`). */
  providerName?: string
  /** Execution backend: `cli` (local login state, default) or `sdk` (needs CURSOR_API_KEY). */
  driver?: CursorDriver
  /** Cursor model id passed to the driver (default pinned in resolveConfig). */
  model?: string
  /**
   * Explicit child/driver environment layered over a credential-scrubbed parent
   * env. `CURSOR_API_KEY` is only required for driver=sdk.
   */
  env?: Record<string, string>
  /** cursor-agent executable path (driver=cli; default resolved from PATH). */
  cliPath?: string
  /** Hard wall-clock limit per one-shot run in ms (driver=cli; default 600000). */
  timeoutMs?: number
  /** Positive grace (ms) for teardown waits (default 3000). */
  disposeGraceMs?: number
}

export const name = 'dsh-subagent-cursor'
/** Subprocess peer reserved for Phase 0 process ownership; drivers own their processes. */
export const inject = ['subagents']

export const defaultConfig = {
  providerName: 'cursor',
  driver: 'cli' as CursorDriver,
  model: 'composer-2.5',
  env: {},
  cliPath: 'cursor-agent',
  timeoutMs: 600_000,
  disposeGraceMs: 3000,
} satisfies Required<CursorSubagentConfig>

export function resolveConfig(config: CursorSubagentConfig = {}): Required<CursorSubagentConfig> {
  return {
    providerName: config.providerName ?? defaultConfig.providerName,
    driver: config.driver ?? defaultConfig.driver,
    model: config.model ?? defaultConfig.model,
    env: config.env ?? defaultConfig.env,
    cliPath: config.cliPath ?? defaultConfig.cliPath,
    timeoutMs: config.timeoutMs ?? defaultConfig.timeoutMs,
    disposeGraceMs: config.disposeGraceMs ?? defaultConfig.disposeGraceMs,
  }
}

export function apply(ctx: Context, config: CursorSubagentConfig = {}): void {
  const resolved = resolveConfig(config)
  if (!Number.isFinite(resolved.disposeGraceMs) || resolved.disposeGraceMs <= 0) {
    throw new Error('dsh-subagent-cursor: disposeGraceMs must be a positive finite number')
  }
  if (!Number.isFinite(resolved.timeoutMs) || resolved.timeoutMs <= 0) {
    throw new Error('dsh-subagent-cursor: timeoutMs must be a positive finite number')
  }
  if (resolved.driver !== 'cli' && resolved.driver !== 'sdk') {
    throw new Error(`dsh-subagent-cursor: driver must be "cli" or "sdk" (got ${JSON.stringify(resolved.driver)})`)
  }
  if (resolved.providerName.trim() === '') {
    throw new Error('dsh-subagent-cursor: providerName must be non-empty')
  }
  registerCursorProvider(ctx, resolved)
}

export default {
  name,
  inject,
  apply,
}
