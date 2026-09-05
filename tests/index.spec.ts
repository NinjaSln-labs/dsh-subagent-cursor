import { describe, expect, it, vi } from 'vitest'
import { apply, defaultConfig } from '../src/index.ts'

function fakeCtx() {
  return {
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    subagents: { registerProvider: vi.fn() },
  } as never
}

describe('apply', () => {
  it('calls the permission ensurer when autoPermissions is on (default)', () => {
    const ensurer = vi.fn(() => ({ kind: 'unchanged' as const, filePath: '/tmp/x.json' }))
    const ctx = fakeCtx() as any
    apply(ctx, {}, ensurer as never)
    expect(ensurer).toHaveBeenCalledTimes(1)
  })
  it('skips the permission ensurer when autoPermissions is off', () => {
    const ensurer = vi.fn(() => ({ kind: 'unchanged' as const, filePath: '/tmp/x.json' }))
    const ctx = fakeCtx() as any
    apply(ctx, { autoPermissions: false }, ensurer as never)
    expect(ensurer).not.toHaveBeenCalled()
    expect(defaultConfig.autoPermissions).toBe(true)
  })
})
