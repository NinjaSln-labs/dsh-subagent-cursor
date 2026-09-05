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
import { grantPermissions } from './cli-permissions.ts'

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
        ? { onBlocked: (blockedText: string, rejected?: readonly string[]) =>
            this.authorizeBlocked(blockedText, rejected, request) }
        : {}),
    }
    return this.startRun(request, deps)
  }

  /** 弹宿主问题窗，把被拒命令授权进 Cursor allowlist（或让用户拒绝/自定义）。 */
  private async authorizeBlocked(
    blockedText: string,
    rejected: readonly string[] | undefined,
    request: ResolvedSubagentStartRequest,
  ): Promise<string> {
    const log = (msg: string) => this.ctx.logger?.info?.(`dsh-subagent-cursor: ${msg}`)
    log(`authorizeBlocked rejected=${JSON.stringify(rejected ?? [])}`)
    const keep = () => `${blockedText}\n\n（Cursor 权限不足导致部分操作被拒。）`
    const answerer = this.ctx.get('userQuestions')
    if (answerer === undefined) {
      log('userQuestions unavailable; skipping auth bridge')
      return keep()
    }
    log('auth bridge ready')
    try {
      // 只取命令名展示（不含参数/完整命令行）；授权粒度 = Shell(<命令名>)
      const deniedCommands = (rejected ?? []).filter((c) => c.length > 0)
      const deniedNames = deniedCommands.map((cmd: string) => cmd.split(/\s+/, 1)[0] ?? cmd)
      const deniedDetail = deniedNames.length > 0
        ? deniedNames.map((name: string) => `  ${name}`).join('\n')
        : `  ${blockedText.split('\n', 1)[0]}`
      // ask 需要发起委派的 exact-live agent（request.parent）才能弹给人
      const answer = await answerer.ask({
        questions: [
          {
            id: 'cursor-permission',
            header: 'Cursor 权限授权',
            question: `Cursor 子代理要用的命令被权限策略拒绝：\n${deniedDetail}\n\n如何处置？`,
            options: [
              { label: '授权', description: '把上述命令加入 Cursor 白名单，重试本委派即可。' },
              { label: '拒绝', description: '保留原样，仅报告被拒结果。' },
              { label: '自定义', description: '自己指定要放行的命令（选此项并在输入框填写，如 ping，多条约逗号/换行分隔）。' },
            ],
          },
        ],
        agent: request.parent,
      })
      const selected: string[] = answer.answers?.[0]?.selected ?? []
      const custom: string = answer.answers?.[0]?.custom?.trim() ?? ''
      let grants: string[] = []
      if (selected.includes('授权')) {
        // 精确放行被拒命令名（Shell(<命令名>) 粒度）
        grants = deniedNames.length > 0
          ? deniedNames.map((name: string) => `Shell(${name})`)
          : []
      } else if (selected.includes('自定义') && custom.length > 0) {
        // 用户自填：兼容 Shell(...) 形式与裸命令名
        grants = custom.split(/[\n,;]/).map((s: string) => s.trim()).filter(Boolean).map((item: string) =>
          /^Shell\(/.test(item) || /^Read\(/.test(item) || /^Write\(/.test(item) || /^WebFetch\(/.test(item)
            ? item
            : `Shell(${item.split(/\s+/, 1)[0]})`,
        )
      } else {
        return blockedText // 拒绝或不识别 → 原样
      }
      if (grants.length === 0) return blockedText
      const out = grantPermissions(grants)
      return `${blockedText}\n\n已授权 ${grants.length} 条命令${out.added > 0 ? `（新增 ${out.added} 条）` : '（均已存在）'}，请重试本委派。`
    } catch (error) {
      this.ctx.logger?.warn?.(
        `dsh-subagent-cursor: auth bridge ask failed (${error instanceof Error ? error.message : String(error)})`,
      )
      return keep()
    }
  }
}

/** Register the Cursor provider on `ctx.subagents`. */
export function registerCursorProvider(ctx: Context, config: Resolved): void {
  ctx.subagents.registerProvider(new CursorProvider(config.providerName, ctx, config))
  ctx.logger.info(`dsh-subagent-cursor: registered provider "${config.providerName}"`)
}
