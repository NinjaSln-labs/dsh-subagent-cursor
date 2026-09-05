import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { ResolvedSubagentStartRequest, SubagentRun } from '@deepseek-ai/dsh-subagent'
import { CursorProvider, type CursorStartRunner } from '../src/provider.ts'
import { resolveConfig } from '../src/index.ts'
import type { CursorRunDeps } from '../src/run.ts'

function fakeCtx(): Context {
  return {
    get: () => undefined, // userQuestions 不可用 → preflight/授权桥静默跳过
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    subagents: { registerProvider: () => {} },
  } as unknown as Context
}

function fakeResolvedRequest(cwd: string | undefined): ResolvedSubagentStartRequest {
  return {
    prompt: [{ type: 'text', text: 'List package name' }],
    parent: {
      session: {
        header: cwd === undefined ? {} : { cwd },
      },
    },
    signal: new AbortController().signal,
    descriptor: {} as ResolvedSubagentStartRequest['descriptor'],
  } as ResolvedSubagentStartRequest
}

describe('CursorProvider.start', () => {
  it('start rejects when parent has no cwd', async () => {
    const provider = new CursorProvider(
      'cursor',
      fakeCtx(),
      resolveConfig({ env: { CURSOR_API_KEY: 'k' } }),
    )
    await expect(provider.start(fakeResolvedRequest(undefined))).rejects.toThrow(/cwd/i)
  })

  it('start delegates to startCursorRun with apiKey from env', async () => {
    const published: SubagentRun = {
      id: 'run-1' as SubagentRun['id'],
      localAgent: undefined,
      result: Promise.resolve({ output: [], stopReason: 'completed' }),
      dispose: async () => {},
    }
    let capturedRequest: ResolvedSubagentStartRequest | undefined
    let capturedDeps: CursorRunDeps | undefined
    const startRun: CursorStartRunner = async (request, deps) => {
      capturedRequest = request as ResolvedSubagentStartRequest
      capturedDeps = deps
      return published
    }
    const provider = new CursorProvider(
      'cursor',
      fakeCtx(),
      resolveConfig({
        model: 'auto',
        env: { CURSOR_API_KEY: 'from-env' },
        disposeGraceMs: 1500,
      }),
      startRun,
    )

    const request = fakeResolvedRequest(process.cwd())
    const run = await provider.start(request)
    expect(run).toBe(published)
    expect(capturedRequest).toBe(request)
    expect(capturedDeps).toMatchObject({
      apiKey: 'from-env',
      model: 'auto',
      disposeGraceMs: 1500,
    })
  })

  it('wires the real startCursorRun by default (sdk driver without key rejects)', async () => {
    const provider = new CursorProvider(
      'cursor',
      fakeCtx(),
      resolveConfig({ driver: 'sdk', env: { CURSOR_API_KEY: '' } }),
    )
    // Empty key rejects inside startCursorRun — proves default runner is live.
    await expect(provider.start(fakeResolvedRequest(process.cwd()))).rejects.toThrow(/apiKey|CURSOR_API_KEY|auth/i)
  })

  it('defaults to cli driver (no key needed) and forwards driver fields', async () => {
    const published: SubagentRun = {
      id: 'run-cli' as SubagentRun['id'],
      localAgent: undefined,
      result: Promise.resolve({ output: [], stopReason: 'completed' }),
      dispose: async () => {},
    }
    let capturedDeps: CursorRunDeps | undefined
    const provider = new CursorProvider(
      'cursor',
      fakeCtx(),
      resolveConfig({ driver: 'cli', env: {}, timeoutMs: 12345, cliPath: '/opt/cursor-agent' }),
      async (_request, deps) => {
        capturedDeps = deps
        return published
      },
    )
    const run = await provider.start(fakeResolvedRequest(process.cwd()))
    expect(run).toBe(published)
    expect(capturedDeps).toMatchObject({
      driver: 'cli',
      apiKey: '',
      cliPath: '/opt/cursor-agent',
      timeoutMs: 12345,
    })
  })
})

describe('CursorProvider authorization bridge assembly', () => {
  it('assembles onBlocked into deps when askOnBlocked is enabled', async () => {
    const { CursorProvider } = await import('../src/provider.ts')
    const { resolveConfig } = await import('../src/index.ts')
    const published = {
      id: 'r1' as SubagentRun['id'], localAgent: undefined,
      result: Promise.resolve({ output: [], stopReason: 'completed' as const }),
      dispose: async () => {},
    }
    let capturedDeps: CursorRunDeps | undefined
    const startRun = async (_r: unknown, deps: CursorRunDeps) => { capturedDeps = deps; return published }
    const ctx = {
      get: () => undefined, // userQuestions 不可用 → keep 文案
      logger: { info: () => {}, warn: () => {} },
      subagents: { registerProvider: () => {} },
    }
    const provider = new CursorProvider(
      'cursor', ctx as never, resolveConfig({ driver: 'cli', askOnBlocked: true }), startRun as never,
    )
    const req = fakeResolvedRequest(process.cwd())
    await provider.start(req as never)
    expect(capturedDeps?.onBlocked).toBeDefined()
    // userQuestions 不可用 → keep() 保留原文，retry 不被调
    const retry = async () => 'RETRY-RESULT'
    const out = await capturedDeps!.onBlocked!('whoami was rejected [blocked]', ['whoami'], retry)
    expect(out).toContain('whoami was rejected') // keep() 保留原文
    expect(capturedDeps?.onBlocked).toBeDefined()
  })
  it('does not assemble onBlocked under strict or trusted approvalLevel', async () => {
    const { CursorProvider } = await import('../src/provider.ts')
    const { resolveConfig } = await import('../src/index.ts')
    const published = {
      id: 'r1' as SubagentRun['id'], localAgent: undefined,
      result: Promise.resolve({ output: [], stopReason: 'completed' as const }),
      dispose: async () => {},
    }
    for (const level of ['strict', 'trusted'] as const) {
      let capturedDeps: CursorRunDeps | undefined
      const startRun = async (_r: unknown, deps: CursorRunDeps) => { capturedDeps = deps; return published }
      const provider = new CursorProvider(
        'cursor',
        { get: () => undefined, logger: { info: () => {}, warn: () => {} }, subagents: {} } as never,
        resolveConfig({ driver: 'cli', approvalLevel: level }), startRun as never,
      )
      await provider.start(fakeResolvedRequest(process.cwd()) as never)
      expect(capturedDeps?.onBlocked, `level=${level}`).toBeUndefined()
      expect(capturedDeps?.approvalLevel, `level=${level}`).toBe(level)
    }
  })
})

describe('CursorProvider DSH-level auto-grant', () => {
  it('auto-grants and retries without asking when the DSH preset is approval=never', async () => {
    // HOME 隔离：grantPermissions 写临时 HOME 的 cli-config，避免污染真实配置
    const os = await import('node:os')
    const fs = await import('node:fs')
    const path = await import('node:path')
    const oldHome = process.env.HOME
    process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-autogrant-'))
    try {
      // 先建好默认权限，使 preflight（缺≥5才问）不触发
      const perms = await import('../src/cli-permissions.ts')
      perms.ensureGlobalPermissions()
      const { CursorProvider } = await import('../src/provider.ts')
      const { resolveConfig } = await import('../src/index.ts')
      const asked = { count: 0 }
      const ctx = {
        get: (name: string) => {
          if (name === 'permissionPresets') return {
            current: () => 'loose',
            resolve: () => ({ sandbox: 'danger-full-access', approval: 'never', name: 'loose' }),
          }
          if (name === 'sessions') return { get: () => ({ id: 's1' }) }
          if (name === 'userQuestions') return {
            ask: async () => {
              asked.count += 1
              // preflight 会问「补齐」→ 返回跳过；授权桥（本用例不该触发）→ 抛
              return { answers: [{ id: 'cursor-permissions-baseline', selected: ['跳过'] }] }
            },
          }
          return undefined
        },
        logger: { info: () => {}, warn: () => {} },
        subagents: {},
      }
      const published = {
        id: 'r1' as SubagentRun['id'], localAgent: undefined,
        result: Promise.resolve({ output: [], stopReason: 'completed' as const }),
        dispose: async () => {},
      }
      let capturedDeps: CursorRunDeps | undefined
      const startRun = async (_r: unknown, deps: CursorRunDeps) => { capturedDeps = deps; return published }
      const provider = new CursorProvider('cursor', ctx as never,
        resolveConfig({ driver: 'cli', approvalLevel: 'balanced' }), startRun as never)
      const req = fakeResolvedRequest(process.cwd()) as never
      await provider.start(req)
      expect(capturedDeps?.onBlocked).toBeDefined()
      let retried = false
      const out = await capturedDeps!.onBlocked!('whoami blocked', ['whoami'], async () => { retried = true; return 'RETRY-OK' })
      expect(asked.count).toBe(0) // 不弹窗
      expect(retried).toBe(true)  // 自动重发
      expect(out).toBe('RETRY-OK')
    } finally {
      process.env.HOME = oldHome
    }
  })
})
