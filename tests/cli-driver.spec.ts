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
