import { describe, expect, it } from 'vitest'
import { formatForParent, parseResultText } from '../src/result-format.ts'
import { formatDiagnostic } from '../src/failure.ts'

describe('parseResultText', () => {
  it('extracts summary, status, and body when structured', () => {
    const parsed = parseResultText(
      '<summary>Listed package name</summary>\n<status>ok</status>\n<body>name: dsh-plugins</body>',
    )
    expect(parsed.structured).toBe(true)
    expect(parsed.summary).toBe('Listed package name')
    expect(parsed.status).toBe('ok')
    expect(parsed.body).toBe('name: dsh-plugins')
  })

  it('falls back to first line when unstructured', () => {
    const parsed = parseResultText('Done reading file.\nMore detail here.')
    expect(parsed.structured).toBe(false)
    expect(parsed.summary).toBe('Done reading file.')
    expect(parsed.body).toContain('More detail here.')
  })
})

describe('formatForParent', () => {
  it('puts summary first and renders body as a markdown blockquote (no raw HTML)', () => {
    const text = formatForParent({
      summary: 'Patched auth',
      status: 'ok',
      body: 'Touched src/auth.ts',
      structured: true,
    })
    expect(text.startsWith('Patched auth [ok]')).toBe(true)
    expect(text).not.toContain('<details>')
    expect(text).toContain('> Touched src/auth.ts')
  })
  it('handles multi-line bodies as blockquote lines', () => {
    const text = formatForParent({
      summary: 's',
      status: 'ok',
      body: 'line1\n\nline2',
      structured: true,
    })
    expect(text).toContain('> line1\n>\n> line2')
  })
})

describe('formatDiagnostic', () => {
  it('renders the closed-set line', () => {
    expect(formatDiagnostic({ stage: 'query-run', category: 'auth', runId: 'r1' }))
      .toBe('cursor:query-run/auth; run=r1')
  })
})

describe('formatForParent with marker', () => {
  it('prefixes the summary with the marker', async () => {
    const { formatForParent, parseResultText } = await import('../src/result-format.ts')
    const out = formatForParent(parseResultText('<summary>ok done</summary><status>ok</status><body>detail</body>'), 'Cursor 委派结果')
    expect(out.startsWith('Cursor 委派结果：')).toBe(true)
    expect(out).toContain('ok done')
    expect(out).toContain('[ok]')
  })
  it('keeps output unchanged without a marker', async () => {
    const { formatForParent, parseResultText } = await import('../src/result-format.ts')
    const withMarker = formatForParent(parseResultText('<summary>s</summary>'), 'Cursor 委派结果')
    const without = formatForParent(parseResultText('<summary>s</summary>'))
    expect(withMarker.startsWith('Cursor 委派结果：s')).toBe(true)
    expect(without.startsWith('Cursor 委派结果')).toBe(false)
  })
})

describe('formatForParent strips stray HTML', () => {
  it('removes child-authored <details> wrappers', () => {
    const out = formatForParent(parseResultText('<summary>ok</summary><body><details>\nCommands: git status\n</details></body>'), 'Cursor 委派结果')
    expect(out).not.toContain('<details>')
    expect(out).not.toContain('&lt;details&gt;')
    expect(out).toContain('> Commands: git status')
  })
  it('removes HTML-escaped tags too', () => {
    const out = formatForParent(parseResultText('<summary>s</summary><body>&lt;details&gt;x&lt;/details&gt;</body>'))
    expect(out).not.toContain('details')
    expect(out).toContain('> x')
  })
})

describe('formatForParent marker idempotency', () => {
  it('does not double the marker when summary already carries it', () => {
    const parsed = { summary: 'Cursor 委派结果：done ok', status: 'ok' as const, body: '', structured: true }
    const out = formatForParent(parsed, 'Cursor 委派结果')
    expect(out).toBe('Cursor 委派结果：done ok [ok]')
    expect(out.match(/Cursor 委派结果/g)?.length).toBe(1)
  })
})
