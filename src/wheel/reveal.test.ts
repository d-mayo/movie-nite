import { expect, test } from 'vitest'
import { finishWindow, formatRuntime, synopsisSnippet } from './reveal.ts'

test('finish window is reveal time plus runtime, then 15 minutes', () => {
  expect(finishWindow(new Date(2026, 9, 5, 20, 0), 112)).toEqual({
    start: '21:52',
    end: '22:07',
  })
})

test('finish window wraps past midnight', () => {
  expect(finishWindow(new Date(2026, 9, 5, 23, 30), 45)).toEqual({
    start: '00:15',
    end: '00:30',
  })
})

test('finish window is null without a runtime', () => {
  expect(finishWindow(new Date(2026, 9, 5, 20, 0), null)).toBeNull()
})

test('formatRuntime', () => {
  expect(formatRuntime(112)).toBe('1h 52m')
  expect(formatRuntime(45)).toBe('45m')
  expect(formatRuntime(120)).toBe('2h')
})

test('synopsisSnippet keeps short text and cuts long text at a word', () => {
  expect(synopsisSnippet('Short one.', 50)).toBe('Short one.')
  expect(synopsisSnippet('alpha beta gamma delta', 12)).toBe('alpha beta…')
  const long = 'word '.repeat(100)
  const snippet = synopsisSnippet(long, 200)
  expect(snippet.length).toBeLessThanOrEqual(201)
  expect(snippet.endsWith('…')).toBe(true)
  expect(snippet).not.toMatch(/ …$/)
})
