import { describe, expect, it, vi } from 'vitest'
import { createLetterboxdClient } from './client'

const reply = (status: number, body: unknown) => async () =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function clientWith(fetchFn: (...args: Parameters<typeof fetch>) => Promise<Response>) {
  const mock = vi.fn(fetchFn)
  return { client: createLetterboxdClient('https://api.test', mock as typeof fetch), mock }
}

describe('checkProfile', () => {
  it('asks the Worker for the profile and reads a 200 naming it as found', async () => {
    const { client, mock } = clientWith(reply(200, { username: 'jo' }))
    expect(await client.checkProfile('jo')).toBe('found')
    expect(mock.mock.calls[0][0]).toBe('https://api.test/lb/jo')
  })

  it("reads the Worker's No such profile 404 as missing", async () => {
    const { client } = clientWith(reply(404, { error: 'No such profile' }))
    expect(await client.checkProfile('jo')).toBe('missing')
  })

  it.each([
    ['a 200 naming another user', reply(200, { ok: true, status: 200, challenged: false })],
    ['a 200 for someone else', reply(200, { username: 'sam' })],
    ['a 404 Not found', reply(404, { error: 'Not found' })],
    ['a 502', reply(502, { error: 'Letterboxd could not be checked' })],
    ['a 429', reply(429, { error: 'Too many requests' })],
    ['a body that is not JSON', async () => new Response('<html>', { status: 200 })],
    [
      'a thrown fetch',
      async () => {
        throw new TypeError('Failed to fetch')
      },
    ],
  ])('reads %s as unavailable', async (_, fetchFn) => {
    const { client } = clientWith(fetchFn)
    expect(await client.checkProfile('jo')).toBe('unavailable')
  })

  it('rethrows an abort through the signal', async () => {
    const controller = new AbortController()
    const { client } = clientWith(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        }),
    )
    const pending = client.checkProfile('jo', controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})
