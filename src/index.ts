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
import { ensureGlobalPermissions, type EnsurePermissionsResult } from './cli-permissions.ts'

/** Plugin config; every field optional with a sane default. */
export interface CursorSubagentConfig {
  /** Registry name on `ctx.subagents` (default `cursor`). */
  providerName?: string
  /** Execution backend: `cli` (local login state, default) or `sdk` (needs CURSOR_API_KEY). */
  driver?: CursorDriver
  /** Cursor model id passed to the driver (`auto` = driver-side auto selection). */
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
  /**
   * On plugin mount, ensure the global Cursor CLI config carries a sensible
   * default permission set (create if missing, append-only merge if present).
   * True by default so a fresh install can delegate right away.
   */
  autoPermissions?: boolean
  /**
   * When a cli delegation result carries a permission-denied trace, ask the
   * user (host answerer popup) whether to grant the common commands and retry.
   * Superseded by `approvalLevel` when that is set. Default false.
   */
  askOnBlocked?: boolean
  /**
   * Command-approval posture for the cursor subprocess:
   *   'balanced' (default) — allowlist is respected; denied commands pop the
   *     authorization bridge (when askOnBlocked is on / preflight fills gaps).
   *   'trusted' — spawn with --yolo so commands auto-approve (except explicit
   *     deny rules); no popups. Use for trusted/automation contexts.
   *   'strict' — allowlist enforced hard; no popups, no auto-approve.
   */
  approvalLevel?: ApprovalLevel
}

/** 命令审批等级。 */
export type ApprovalLevel = 'balanced' | 'trusted' | 'strict'

export const name = 'dsh-subagent-cursor'
/** Subprocess peer reserved for Phase 0 process ownership; drivers own their processes. */
export const inject = ['subagents']

export const defaultConfig = {
  providerName: 'cursor',
  driver: 'cli' as CursorDriver,
  model: 'auto',
  env: {},
  cliPath: 'cursor-agent',
  timeoutMs: 600_000,
  approvalLevel: 'balanced' as ApprovalLevel,
  disposeGraceMs: 3000,
  autoPermissions: true,
  askOnBlocked: false,
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
    autoPermissions: config.autoPermissions ?? defaultConfig.autoPermissions,
    askOnBlocked: config.askOnBlocked ?? defaultConfig.askOnBlocked,
    approvalLevel: config.approvalLevel ?? defaultConfig.approvalLevel,
  }
}

/** 权限确保器（注入便于测试）。 */
export type PermissionEnsurer = () => EnsurePermissionsResult

export function apply(
  ctx: Context,
  config: CursorSubagentConfig = {},
  ensurePermissions: PermissionEnsurer = () => ensureGlobalPermissions(),
): void {
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
  if (!['balanced', 'trusted', 'strict'].includes(resolved.approvalLevel)) {
    throw new Error(`dsh-subagent-cursor: approvalLevel must be balanced|trusted|strict (got ${JSON.stringify(resolved.approvalLevel)})`)
  }
  if (resolved.autoPermissions) {
    try {
      const out = ensurePermissions()
      const count = out.kind === 'merged' ? (out.added ?? []).length : 0
      const summary = out.kind === 'unchanged' ? '已是最新' : `已 ${out.kind === 'created' ? '创建' : `补齐 ${count} 项`}`
      ctx.logger.info(`dsh-subagent-cursor: cursor CLI 权限预生成 → ${out.filePath}（${summary}）`)
    } catch (error) {
      ctx.logger.warn(`dsh-subagent-cursor: cursor CLI 权限预生成跳过（${error instanceof Error ? error.message : String(error)}）`)
    }
  }
  registerCursorProvider(ctx, resolved)
}

export default {
  name,
  inject,
  apply,
}
