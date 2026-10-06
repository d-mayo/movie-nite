import { afterEach, expect, test, vi } from 'vitest'
import { newId } from './id.ts'

const realCrypto = globalThis.crypto

afterEach(() => vi.unstubAllGlobals())

// What a plain-HTTP origin offers: getRandomValues but no randomUUID.
function withoutRandomUUID() {
  vi.stubGlobal('crypto', {
    getRandomValues: <T extends ArrayBufferView>(array: T) => realCrypto.getRandomValues(array),
  })
}

test('uses crypto.randomUUID when it exists', () => {
  vi.stubGlobal('crypto', { randomUUID: () => 'fixed-id', getRandomValues: vi.fn() })
  expect(newId()).toBe('fixed-id')
})

test('without randomUUID it builds a version-4 UUID, and each one differs', () => {
  withoutRandomUUID()
  const ids = Array.from({ length: 50 }, () => newId())
  for (const id of ids) {
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  }
  expect(new Set(ids).size).toBe(50)
})
