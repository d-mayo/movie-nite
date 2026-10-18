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

describe('watchlistPage', () => {
  it('asks the Worker for the page and reads its slugs', async () => {
    const { client, mock } = clientWith(reply(200, { slugs: ['a', 'b'], hasNext: true }))
    expect(await client.watchlistPage('jo', 2)).toEqual({ slugs: ['a', 'b'], hasNext: true })
    expect(mock.mock.calls[0][0]).toBe('https://api.test/lb/jo/watchlist?page=2')
    expect(mock.mock.calls[0][1]).toMatchObject({ cache: 'no-cache' })
  })

  it("reads the Worker's own 404 bodies as private and missing", async () => {
    expect(await clientWith(reply(404, { error: 'Watchlist is private' })).client.watchlistPage('jo', 1)).toBe('private')
    expect(await clientWith(reply(404, { error: 'No such watchlist' })).client.watchlistPage('jo', 1)).toBe('missing')
  })

  it.each([
    ['an unknown 404', reply(404, { error: 'Not found' })],
    ['a 502', reply(502, { error: 'Letterboxd could not be read' })],
    ['a 200 without slugs', reply(200, { ok: true })],
    ['a 200 with a non-string slug', reply(200, { slugs: [1], hasNext: false })],
    ['a body that is not JSON', async () => new Response('<html>', { status: 200 })],
    [
      'a thrown fetch',
      async () => {
        throw new TypeError('Failed to fetch')
      },
    ],
  ])('reads %s as unavailable', async (_, fetchFn) => {
    expect(await clientWith(fetchFn).client.watchlistPage('jo', 1)).toBe('unavailable')
  })

  it('rethrows an abort', async () => {
    const controller = new AbortController()
    const { client } = clientWith(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        }),
    )
    const pending = client.watchlistPage('jo', 1, controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('filmTmdbId', () => {
  it('reads the id, and null for a film with none', async () => {
    const { client, mock } = clientWith(reply(200, { slug: 'x-1', tmdbId: 7 }))
    expect(await client.filmTmdbId('x-1')).toBe(7)
    expect(mock.mock.calls[0][0]).toBe('https://api.test/lb/film/x-1')
    expect(await clientWith(reply(200, { slug: 'x-1', tmdbId: null })).client.filmTmdbId('x-1')).toBeNull()
  })

  it('reads the Worker\'s No such film 404 as null', async () => {
    expect(await clientWith(reply(404, { error: 'No such film' })).client.filmTmdbId('x-1')).toBeNull()
  })

  it.each([
    ['a 200 for another slug', reply(200, { slug: 'y', tmdbId: 7 })],
    ['a 200 with a text id', reply(200, { slug: 'x-1', tmdbId: '7' })],
    ['an unknown 404', reply(404, { error: 'Not found' })],
    ['a 502', reply(502, { error: 'Letterboxd could not be read' })],
    [
      'a thrown fetch',
      async () => {
        throw new TypeError('Failed to fetch')
      },
    ],
  ])('reads %s as unavailable', async (_, fetchFn) => {
    expect(await clientWith(fetchFn).client.filmTmdbId('x-1')).toBe('unavailable')
  })

  it('rethrows an abort', async () => {
    const controller = new AbortController()
    const { client } = clientWith(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        }),
    )
    const pending = client.filmTmdbId('x-1', controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})
