import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'

// 用假 HOME 隔离测试（模块读 homedir()）
const realHome = homedir()
let fakeHome = ''

async function loadModule() {
  // 每次 import 拿最新（模块内部 globalCliConfigPath 读 homedir）
  return await import('../src/cli-permissions.ts')
}

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), 'cursor-perm-'))
  process.env.HOME = fakeHome
})
afterEach(() => {
  process.env.HOME = realHome
  rmSync(fakeHome, { recursive: true, force: true })
})

describe('ensureGlobalPermissions', () => {
  it('creates the config file with the default plan when absent', async () => {
    const { ensureGlobalPermissions } = await loadModule()
    const out = ensureGlobalPermissions()
    expect(out.kind).toBe('created')
    const file = join(fakeHome, '.cursor', 'cli-config.json')
    expect(existsSync(file)).toBe(true)
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    expect(parsed.permissions.allow).toContain('Shell(git)')
    expect(parsed.permissions.allow).toContain('Read(**)')
    expect(parsed.permissions.deny).toContain('Read(.env*)')
  })
  it('merges only missing allow items and preserves existing config', async () => {
    const { ensureGlobalPermissions } = await loadModule()
    ensureGlobalPermissions()
    const file = join(fakeHome, '.cursor', 'cli-config.json')
    // 用户之后加了自定义 allow + deny
    const cfg = JSON.parse(readFileSync(file, 'utf8'))
    cfg.permissions.allow = ['Shell(ls)', 'Shell(user-custom)']
    cfg.permissions.deny = ['Shell(rm)']
    cfg.customField = 1
    writeFileSync(file, JSON.stringify(cfg, null, 2))
    const out = ensureGlobalPermissions()
    expect(out.kind).toBe('merged')
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    // 用户自定义保留
    expect(parsed.permissions.allow).toContain('Shell(user-custom)')
    expect(parsed.permissions.deny).toContain('Shell(rm)')
    // 推荐集补齐（此前 allow 只剩 ls+custom）
    expect(parsed.permissions.allow).toContain('Shell(git)')
    expect(parsed.permissions.allow).toContain('Read(**)')
    expect(parsed.customField).toBe(1)
  })
  it('returns unchanged when everything is already present', async () => {
    const { ensureGlobalPermissions } = await loadModule()
    ensureGlobalPermissions()
    const out = ensureGlobalPermissions()
    expect(out.kind).toBe('unchanged')
  })
})

describe('DEFAULT_PERMISSION_PLAN common read-only commands', () => {
  it('covers curl/python3/ripgrep and common text tools', async () => {
    const { DEFAULT_PERMISSION_PLAN } = await import('../src/cli-permissions.ts')
    const allow = DEFAULT_PERMISSION_PLAN.allow
    for (const cmd of ['Shell(curl:*)', 'Shell(python3)', 'Shell(rg)', 'Shell(sed)', 'Shell(diff)']) {
      expect(allow).toContain(cmd)
    }
  })
})

describe('grantPermissions', () => {
  it('appends explicit entries to an existing config and reports added count', async () => {
    const { ensureGlobalPermissions, grantPermissions } = await import('../src/cli-permissions.ts')
    ensureGlobalPermissions()
    const file = join(fakeHome, '.cursor', 'cli-config.json')
    const out = grantPermissions(['Shell(ping)', 'Shell(whoami)'])
    expect(out.added).toBe(2)
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    expect(parsed.permissions.allow).toContain('Shell(ping)')
    expect(parsed.permissions.allow).toContain('Shell(whoami)')
    // 二次授权已存在的 → added 0
    expect(grantPermissions(['Shell(ping)']).added).toBe(0)
  })
})

describe('missingDefaultPermissions', () => {
  it('reports which default entries are absent', async () => {
    const { missingDefaultPermissions, ensureGlobalPermissions } = await import('../src/cli-permissions.ts')
    ensureGlobalPermissions()
    const file = join(fakeHome, '.cursor', 'cli-config.json')
    // 删掉几个常用项模拟缺失
    const cfg = JSON.parse(readFileSync(file, 'utf8'))
    cfg.permissions.allow = cfg.permissions.allow.filter((x: string) => !['Shell(git)', 'Shell(node)'].includes(x))
    writeFileSync(file, JSON.stringify(cfg, null, 2))
    const { missing, present } = missingDefaultPermissions(file)
    expect(missing).toContain('Shell(git)')
    expect(missing).toContain('Shell(node)')
    expect(present).toBeGreaterThan(0)
  })
  it('treats a missing config file as fully missing', async () => {
    const { missingDefaultPermissions } = await import('../src/cli-permissions.ts')
    const file = join(fakeHome, '.cursor', 'does-not-exist.json')
    const { missing } = missingDefaultPermissions(file)
    expect(missing.length).toBeGreaterThan(10)
  })
})
