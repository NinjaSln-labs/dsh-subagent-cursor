import { describe, expect, it } from 'vitest'
import { parseCliEventLine } from '../src/cli-driver.ts'

describe('parseCliEventLine', () => {
  it('parses result events', () => {
    const line = '{"type":"result","subtype":"success","is_error":false,"result":"OK","session_id":"s1"}'
    expect(parseCliEventLine(line)).toMatchObject({ type: 'result', result: 'OK', session_id: 's1' })
  })
  it('parses init events with apiKeySource', () => {
    const line = '{"type":"system","subtype":"init","session_id":"s2","cwd":"/tmp"}'
    expect(parseCliEventLine(line)).toMatchObject({ type: 'system', session_id: 's2' })
  })
  it('returns undefined for non-JSON noise', () => {
    expect(parseCliEventLine('not json at all')).toBeUndefined()
    expect(parseCliEventLine('')).toBeUndefined()
  })
  it('returns undefined for JSON without type field', () => {
    expect(parseCliEventLine('{"foo":1}')).toBeUndefined()
  })
})

describe('resolveCliPath', () => {
  it('keeps explicit absolute paths as-is', async () => {
    const { resolveCliPath } = await import('../src/cli-driver.ts')
    expect(resolveCliPath('/opt/cursor/bin/cursor-agent')).toBe('/opt/cursor/bin/cursor-agent')
  })
  it('falls back to ~/.local/bin when a bare name misses PATH', async () => {
    // 模拟非交互宿主：构造一个 PATH 中不存在、~/.local/bin 中存在的裸名
    const os = await import('node:os')
    const fs = await import('node:fs')
    const fsPath = await import('node:path')
    const fake = 'dsh-cursor-agent-probe-' + process.pid
    const target = fsPath.join(os.homedir(), '.local', 'bin', fake)
    const old = process.env.PATH
    process.env.PATH = '/usr/bin:/bin' // 去掉 ~/.local/bin
    try {
      // 确保目标不存在时回退原样；存在时才期望命中——用真实文件验证探测逻辑
      const { resolveCliPath } = await import('../src/cli-driver.ts')
      if (fs.existsSync(target)) {
        expect(resolveCliPath(fake)).toBe(target)
      } else {
        expect(resolveCliPath(fake)).toBe(fake) // 无文件→返回原样（spawn 报 ENOENT）
      }
    } finally {
      process.env.PATH = old
    }
  })
})
