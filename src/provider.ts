/**
 * Cursor SubagentProvider registration.
 *
 * Wires `start()` to the SDK one-shot driver with apiKey from config.env.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {
  ResolvedSubagentStartRequest,
  SubagentCapabilities,
  SubagentProvider,
  SubagentRun,
  SubagentStartRequest,
} from '@deepseek-ai/dsh-subagent'
import type { CursorSubagentConfig } from './index.ts'
import { startCursorRun, type CursorRunDeps } from './run.ts'
import { ensureGlobalPermissions } from './cli-permissions.ts'

type Resolved = Required<CursorSubagentConfig>

export type CursorStartRunner = (
  request: SubagentStartRequest,
  deps: CursorRunDeps,
) => Promise<SubagentRun>

export class CursorProvider implements SubagentProvider {
  readonly capabilities: SubagentCapabilities = {
    // Cursor one-shot runs don't consume per-call provider/model overrides.
    agentOptions: false,
    outputSchema: false,
    depthLimit: false,
    toolFilter: false,
    persona: false,
  }
  readonly inheritsParentContext = false

  constructor(
    readonly name: string,
    private readonly ctx: Context,
    private readonly config: Resolved,
    private readonly startRun: CursorStartRunner = startCursorRun,
  ) {}

  start(request: ResolvedSubagentStartRequest): Promise<SubagentRun> {
    void this.ctx
    const apiKey = this.config.env.CURSOR_API_KEY ?? ''
    const deps: CursorRunDeps = {
      driver: this.config.driver,
      apiKey,
      model: this.config.model,
      disposeGraceMs: this.config.disposeGraceMs,
      cliPath: this.config.cliPath,
      timeoutMs: this.config.timeoutMs,
      env: this.config.env,
      // 授权桥：cli 结果被拒 → 宿主弹窗征询 → 允许则加白名单（askOnBlocked 开启时）
      ...(this.config.driver === 'cli' && this.config.askOnBlocked
        ? { onBlocked: (blockedText: string) => this.authorizeBlocked(blockedText) }
        : {}),
    }
    return this.startRun(request, deps)
  }

  /** 弹宿主问题窗，把被拒命令授权进 Cursor allowlist（或让用户拒绝）。 */
  private async authorizeBlocked(blockedText: string): Promise<string> {
    const answerer = this.ctx.get('userQuestions')
    // 默认回退：保留原文本（若弹窗服务不可用）
    const keep = () => `${blockedText}\n\n（Cursor 权限不足导致部分操作被拒。）`
    if (answerer === undefined) return keep()
    try {
      const answer = await answerer.ask({
        questions: [
          {
            id: 'cursor-permission',
            header: 'Cursor 权限授权',
            question: `Cursor 子代理有操作被权限策略拒绝：\n${blockedText.split('\n', 1)[0]}\n\n是否放行常用命令？`,
            options: [
              { label: '放行常用命令（推荐）', description: '把缺的常用权限加入 Cursor 白名单，重试本委派即可。' },
              { label: '本次拒绝', description: '保留原样，仅报告被拒结果。' },
            ],
          },
        ],
      })
      const selected = answer.answers?.[0]?.selected ?? []
      if (selected.includes('放行常用命令（推荐）')) {
        const out = ensureGlobalPermissions()
        const addedCount = out.kind === 'merged' ? (out.added ?? []).length : 0
        const note = out.kind === 'unchanged' ? '（白名单已是最新）' : `（已补 ${addedCount} 项）`
        return `${blockedText}\n\n已放行常用命令${note}，请重试本委派。`
      }
      return blockedText
    } catch {
      return keep()
    }
  }
}

/** Register the Cursor provider on `ctx.subagents`. */
export function registerCursorProvider(ctx: Context, config: Resolved): void {
  ctx.subagents.registerProvider(new CursorProvider(config.providerName, ctx, config))
  ctx.logger.info(`dsh-subagent-cursor: registered provider "${config.providerName}"`)
}
