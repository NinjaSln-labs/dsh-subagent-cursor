/**
 * Cursor CLI 权限预生成与合并（cli-permissions）。
 *
 * 目标：新装后 cursor 子代理能直接处理常规问题，不被权限白名单空转拦死。
 * 只做**只追加的合并**：
 *   - 目标文件不存在 → 用推荐集预生成（allow + 保护性 deny）。
 *   - 存在 → 仅补入缺失的 allow 项，绝不动用户已有的 allow / deny / 其他字段。
 *   - 写入前自动备份（`<file>.bak-<ts>`），配置损坏时保留现场。
 * 安全边界：推荐 deny 保护敏感面（.env / 密钥 / 包锁覆盖等），不自动放行
 * 危险命令（rm/sudo/curl 管道执行等）——用户可自行放宽。
 */
import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** 默认全局 Cursor CLI 配置路径。 */
export function globalCliConfigPath(): string {
  return join(homedir(), '.cursor', 'cli-config.json')
}

export type PermissionPlan = {
  readonly allow: readonly string[]
  readonly deny: readonly string[]
}

/**
 * 推荐权限集（按「cursor 子代理处理问题」的常用面分层）。
 * 仅代表合理默认；用户已有配置优先。
 */
export const DEFAULT_PERMISSION_PLAN: PermissionPlan = {
  allow: [
    // —— 读取 / 常规侦查 ——
    'Read(**)', // 文件读取工具任意路径
    'Shell(ls)',
    'Shell(cat)',
    'Shell(head)',
    'Shell(tail)',
    'Shell(wc)',
    'Shell(grep)',
    'Shell(fgrep)',
    'Shell(egrep)',
    'Shell(rg)', // ripgrep 快速检索（若已装）
    'Shell(fd)', // fd 找文件（若已装）
    'Shell(find)',
    'Shell(pwd)',
    'Shell(echo)',
    'Shell(date)',
    'Shell(file)',
    'Shell(which)',
    'Shell(du)',
    'Shell(df)',
    // —— 文本处理（只读管道）——
    'Shell(sort)',
    'Shell(uniq)',
    'Shell(cut)',
    'Shell(awk)',
    'Shell(sed)', // 只读替换演示用；改写文件走 Write 工具
    'Shell(diff)',
    'Shell(cmp)',
    // —— 开发 / git / 构建 ——
    'Shell(git)', // git log/status/diff/show 等（含只读子命令）
    'Shell(node)', // node -e/-p 求值、脚本
    'Shell(npm)',
    'Shell(npx)',
    'Shell(pnpm)',
    'Shell(yarn)',
    'Shell(python3)',
    'Shell(python)',
    // —— 网络只读抓取（curl 无 -o/-O/管道到 sh 等写操作；WebFetch 域名见下）——
    'Shell(curl:*)', // 网络读；危险面（curl | sh）由 deny 或子代理纪律约束
    // —— 构建产物写放行（处理问题常需 build/test）——
    'Write(**)', // 项目内写；危险面靠 deny 保
    // —— 文档 / 网络读取 ——
    'WebFetch(*)', // 允许抓文档；如需收紧删此行
  ],
  deny: [
    'Read(.env*)',
    'Read(**/*.key)',
    'Read(**/*.pem)',
    'Read(**/id_rsa)',
    'Read(**/id_ed25519)',
    'Write(.env*)',
    'Write(**/*.key)',
    'Write(**/*.pem)',
    'Write(**/id_rsa)',
    'Write(**/id_ed25519)',
    // 危险执行面（默认拒绝，需授权才放开）
    'Shell(rm:*)', // rm -rf 类破坏；但 rm 单个临时文件常被文件工具替代
    'Shell(sudo)',
    'Shell(kill)',
    'Shell(reboot)',
    'Shell(shutdown)',
    // 注：curl | sh 这类「网络拉取即执行」链不在 allowlist 默认语义内——
    // 子代理纪律（prompt footer）约束不执行未审计的远程脚本；如需硬拦截可
    // 在用户级 cli-config deny 加对应 Shell 规则。
  ],
}

/**
 * Append explicit permission entries (e.g. `Shell(whoami)`) to the global
 * Cursor CLI allowlist, preserving everything else. Returns how many were
 * actually added (entries already present are not duplicated).
 */
export function grantPermissions(entries: readonly string[]): { added: number } {
  const filePath = globalCliConfigPath()
  const existing = readPermissions(filePath)
  if (existing === null) {
    // 无配置文件 → 用默认集 + 追加的条目一次性创建
    const dedupe = new Set([...DEFAULT_PERMISSION_PLAN.allow])
    for (const entry of entries) dedupe.add(entry)
    const config = {
      version: 1,
      permissions: {
        allow: [...dedupe],
        deny: [...DEFAULT_PERMISSION_PLAN.deny],
      },
    }
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
    return { added: entries.length }
  }
  const existingAllow = new Set(existing.allow)
  const toAdd = entries.filter((entry) => !existingAllow.has(entry))
  if (toAdd.length === 0) return { added: 0 }
  try {
    copyFileSync(filePath, `${filePath}.bak-${Date.now()}`)
  } catch {
    // 备份失败不阻断
  }
  const config = JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>
  const permissions = (config.permissions ?? {}) as { allow?: string[]; deny?: string[] }
  permissions.allow = [...(permissions.allow ?? []), ...toAdd]
  config.permissions = permissions
  writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
  return { added: toAdd.length }
}

/** 读取一个 Cursor CLI 配置的 permissions 段（宽松容错：损坏视为空）。 */
export function readPermissions(filePath: string): { allow: string[]; deny: string[] } | null {
  if (!existsSync(filePath)) return null
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as {
      permissions?: { allow?: unknown; deny?: unknown }
    }
    const allow = Array.isArray(parsed.permissions?.allow)
      ? (parsed.permissions!.allow as unknown[]).filter((x): x is string => typeof x === 'string')
      : []
    const deny = Array.isArray(parsed.permissions?.deny)
      ? (parsed.permissions!.deny as unknown[]).filter((x): x is string => typeof x === 'string')
      : []
    return { allow, deny }
  } catch {
    return null
  }
}

export type EnsurePermissionsResult =
  | { readonly kind: 'created'; readonly filePath: string }
  | { readonly kind: 'merged'; readonly filePath: string; readonly added: readonly string[] }
  | { readonly kind: 'unchanged'; readonly filePath: string }

/**
 * 确保全局 Cursor CLI 配置含推荐权限集（创建或合并，绝不删减既有项）。
 */
export function ensureGlobalPermissions(): EnsurePermissionsResult {
  const filePath = globalCliConfigPath()
  const existing = readPermissions(filePath)

  if (existing === null) {
    mkdirSync(dirname(filePath), { recursive: true })
    const config = {
      version: 1,
      permissions: {
        allow: [...DEFAULT_PERMISSION_PLAN.allow],
        deny: [...DEFAULT_PERMISSION_PLAN.deny],
      },
    }
    writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
    return { kind: 'created', filePath }
  }

  // 合并：只补缺失的 allow，deny 与既有项一律不动
  const existingAllow = new Set(existing.allow)
  const added = DEFAULT_PERMISSION_PLAN.allow.filter((item) => !existingAllow.has(item))
  if (added.length === 0) {
    return { kind: 'unchanged', filePath }
  }
  // deny 推荐项同样只补缺失（用户没显式拒绝过的敏感保护可补，已有 deny 不动）
  const existingDeny = new Set(existing.deny)
  const addedDeny = DEFAULT_PERMISSION_PLAN.deny.filter((item) => !existingDeny.has(item))

  // 写入前备份
  try {
    copyFileSync(filePath, `${filePath}.bak-${Date.now()}`)
  } catch {
    // 备份失败不阻断（无写权限时下方 write 会抛）
  }
  const config = JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>
  const permissions = (config.permissions ?? {}) as { allow?: string[]; deny?: string[] }
  permissions.allow = [...(permissions.allow ?? []), ...added]
  permissions.deny = [...(permissions.deny ?? []), ...addedDeny]
  config.permissions = permissions
  writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
  return { kind: 'merged', filePath, added: [...added, ...addedDeny] }
}

/**
 * 返回常用权限集中当前白名单缺失的条目（读 ~/.cursor/cli-config.json）。
 * 配置文件不存在 → 视为全部缺失。用于委派前评估是否需要提示补齐。
 */
export function missingDefaultPermissions(
  filePath: string = globalCliConfigPath(),
): { readonly missing: readonly string[]; readonly present: number } {
  const existing = readPermissions(filePath)
  const allow = new Set(existing?.allow ?? [])
  const missing = DEFAULT_PERMISSION_PLAN.allow.filter((item) => !allow.has(item))
  return { missing, present: allow.size }
}
