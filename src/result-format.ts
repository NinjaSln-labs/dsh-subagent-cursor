/**
 * Soft result format: summary-first presentation, foldable body.
 *
 * Missing tags do not fail the seam; fall back to first-line summary + full body.
 */

export type ResultStatus = 'ok' | 'partial' | 'blocked' | 'unknown'

export type ParsedResult = {
  readonly summary: string
  readonly status: ResultStatus
  readonly body: string
  /** True when `<summary>` / `<body>` tags were found. */
  readonly structured: boolean
}

const SUMMARY_RE = /<summary>\s*([\s\S]*?)\s*<\/summary>/i
const STATUS_RE = /<status>\s*(ok|partial|blocked)\s*<\/status>/i
const BODY_RE = /<body>\s*([\s\S]*?)\s*<\/body>/i

/** Parse soft-contract Cursor final text into display layers. */
export function parseResultText(text: string): ParsedResult {
  const trimmed = text.trim()
  const summaryMatch = SUMMARY_RE.exec(trimmed)
  const statusMatch = STATUS_RE.exec(trimmed)
  const bodyMatch = BODY_RE.exec(trimmed)

  if (summaryMatch !== null || bodyMatch !== null) {
    const summary = (summaryMatch?.[1] ?? firstLine(trimmed)).trim() || '(empty summary)'
    const body = (bodyMatch?.[1] ?? trimmed).trim()
    const status = (statusMatch?.[1]?.toLowerCase() as ResultStatus | undefined) ?? 'unknown'
    return { summary, status, body, structured: true }
  }

  return {
    summary: firstLine(trimmed) || '(empty)',
    status: 'unknown',
    body: trimmed,
    structured: false,
  }
}

/**
 * Parent-facing tool text: summary first; evidence body follows as a markdown
 * blockquote (no raw HTML — the parent conversation and GUI render markdown,
 * not `<details>` folding). Optional `marker` prefixes the line so the parent
 * conversation can attribute the result to its source (e.g. Cursor).
 */
export function formatForParent(parsed: ParsedResult, marker?: string): string {
  const status = parsed.status === 'unknown' ? '' : ` [${parsed.status}]`
  const detail = parsed.body.length === 0 || parsed.body === parsed.summary
    ? ''
    : `\n\n${quoteLines(parsed.body)}`
  const head = marker === undefined ? '' : `${marker}：`
  return `${head}${parsed.summary}${status}${detail}`
}

/** 每行前置 `> `，转成 markdown 引用块（空行保持结构）。 */
function quoteLines(text: string): string {
  return text
    .split('\n')
    .map((line) => (line.trim() === '' ? '>' : `> ${line}`))
    .join('\n')
}

function firstLine(text: string): string {
  const line = text.split(/\r?\n/, 1)[0] ?? ''
  return line.trim()
}
