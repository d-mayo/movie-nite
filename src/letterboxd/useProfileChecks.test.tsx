import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultState } from '../state/model.ts'
import { createMemoryPersistence } from '../state/persistence.ts'
import { AppStoreContext, createAppStore, type AppStore } from '../state/store.ts'
import { createLetterboxdClient } from './client.ts'
import { useProfileChecks } from './useProfileChecks.ts'

const answer = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const found = (username: string) => answer(200, { username })
const missing = () => answer(404, { error: 'No such profile' })
const unavailable = () => answer(502, { error: 'Letterboxd could not be checked' })

type Reply = (url: string, signal: AbortSignal | undefined) => Promise<Response>

// A fetch whose replies come from `reply`, recording every call made.
function fakeFetch(reply: Reply) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => reply(String(input), init?.signal ?? undefined))
}

// A fetch that never answers until aborted, for checks still in flight.
function hanging(): Promise<Response> & { resolve(r: Response): void } {
  let resolve!: (r: Response) => void
  const p = new Promise<Response>((r) => (resolve = r)) as Promise<Response> & { resolve(r: Response): void }
  p.resolve = resolve
  return p
}

// The viewers with a retry waiting, as the hook last returned them.
function Probe({ fetchFn }: { fetchFn: typeof fetch }) {
  const waiting = useProfileChecks(createLetterboxdClient('https://api.test', fetchFn))
  return <output data-testid="waiting">{[...waiting].join(' ')}</output>
}

const waitingIds = () => (screen.getByTestId('waiting').textContent ?? '').split(' ').filter(Boolean)

function mount(store: AppStore, fetchFn: ReturnType<typeof fakeFetch>) {
  return render(
    <AppStoreContext.Provider value={store}>
      <Probe fetchFn={fetchFn as unknown as typeof fetch} />
    </AppStoreContext.Provider>,
  )
}

function storeWith(...names: string[]): AppStore {
  const store = createAppStore(createMemoryPersistence())
  for (const name of names) store.getState().addViewer(name)
  return store
}

const idOf = (store: AppStore, name: string) => store.getState().roster.find((v) => v.name === name)!.id
const linkOf = (store: AppStore, name: string) => store.getState().roster.find((v) => v.name === name)!.letterboxd

const flush = () => act(async () => {
  await vi.advanceTimersByTimeAsync(0)
})
const wait = (ms: number) => act(async () => {
  await vi.advanceTimersByTimeAsync(ms)
})

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useProfileChecks', () => {
  it('checks a newly linked username at once and stops once it is found', async () => {
    const store = storeWith('Ann')
    const fetchFn = fakeFetch(async () => found('jo'))
    mount(store, fetchFn)
    expect(fetchFn).not.toHaveBeenCalled()
    act(() => store.getState().linkLetterboxd(idOf(store, 'Ann'), 'Jo'))
    await flush()
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(fetchFn.mock.calls[0][0]).toBe('https://api.test/lb/jo')
    expect(linkOf(store, 'Ann')).toEqual({ username: 'jo', status: 'found' })
    await wait(600_000)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('checks a stored pending username on mount, and never a stored found one', async () => {
    const store = createAppStore(
      createMemoryPersistence({
        ...defaultState,
        roster: [
          { id: 'a', name: 'Ann', color: '#000', letterboxd: { username: 'jo', status: 'pending' } },
          { id: 'b', name: 'Bo', color: '#111', letterboxd: { username: 'sam', status: 'found' } },
        ],
      }),
    )
    const fetchFn = fakeFetch(async () => found('jo'))
    mount(store, fetchFn)
    await flush()
    expect(fetchFn.mock.calls.map((c) => c[0])).toEqual(['https://api.test/lb/jo'])
    expect(linkOf(store, 'Ann')?.status).toBe('found')
  })

  it('retries an unavailable check after 15 s and not before', async () => {
    const store = storeWith('Ann')
    const replies = [unavailable, () => found('jo')]
    const fetchFn = fakeFetch(async () => replies.shift()!())
    mount(store, fetchFn)
    act(() => store.getState().linkLetterboxd(idOf(store, 'Ann'), 'jo'))
    await flush()
    expect(linkOf(store, 'Ann')?.status).toBe('pending')
    expect(waitingIds()).toEqual([idOf(store, 'Ann')])
    await wait(14_999)
    expect(fetchFn).toHaveBeenCalledTimes(1)
    await wait(1)
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(linkOf(store, 'Ann')?.status).toBe('found')
    expect(waitingIds()).toEqual([])
  })

  it('backs off 15, 30, 60, then 120 s', async () => {
    const store = storeWith('Ann')
    const fetchFn = fakeFetch(async () => unavailable())
    mount(store, fetchFn)
    act(() => store.getState().linkLetterboxd(idOf(store, 'Ann'), 'jo'))
    await flush()
    for (const [gap, calls] of [
      [15_000, 2],
      [30_000, 3],
      [60_000, 4],
      [120_000, 5],
      [120_000, 6],
    ] as const) {
      await wait(gap - 1)
      expect(fetchFn).toHaveBeenCalledTimes(calls - 1)
      await wait(1)
      expect(fetchFn).toHaveBeenCalledTimes(calls)
    }
  })

  it('sets missing on a No such profile answer', async () => {
    const store = storeWith('Ann')
    mount(store, fakeFetch(async () => missing()))
    act(() => store.getState().linkLetterboxd(idOf(store, 'Ann'), 'jo'))
    await flush()
    expect(linkOf(store, 'Ann')?.status).toBe('missing')
  })

  it('aborts a check in flight on unlink, and a retry due afterwards makes no call', async () => {
    const store = storeWith('Ann')
    const signals: (AbortSignal | undefined)[] = []
    const fetchFn = fakeFetch((_url, signal) => {
      signals.push(signal)
      return new Promise((_resolve, reject) =>
        signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))),
      )
    })
    mount(store, fetchFn)
    act(() => store.getState().linkLetterboxd(idOf(store, 'Ann'), 'jo'))
    await flush()
    act(() => store.getState().unlinkLetterboxd(idOf(store, 'Ann')))
    await flush()
    expect(signals[0]?.aborted).toBe(true)
    await wait(600_000)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('ignores a late answer for a username relinked to another', async () => {
    const store = storeWith('Ann')
    const first = hanging()
    const fetchFn = fakeFetch(async (url) => (url.endsWith('/jo') ? first : found('sam')))
    mount(store, fetchFn)
    const ann = idOf(store, 'Ann')
    act(() => store.getState().linkLetterboxd(ann, 'jo'))
    await flush()
    act(() => store.getState().linkLetterboxd(ann, 'sam'))
    await flush()
    first.resolve(missing())
    await flush()
    expect(linkOf(store, 'Ann')).toEqual({ username: 'sam', status: 'found' })
  })

  it('makes no further call once a viewer with a retry waiting is removed', async () => {
    const store = storeWith('Ann')
    const fetchFn = fakeFetch(async () => unavailable())
    mount(store, fetchFn)
    const ann = idOf(store, 'Ann')
    act(() => store.getState().linkLetterboxd(ann, 'jo'))
    await flush()
    act(() => store.getState().removeViewer(ann))
    await wait(600_000)
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(waitingIds()).toEqual([])
  })

  it('keeps retrying through a spin and New night', async () => {
    const store = storeWith('Ann')
    const replies = [unavailable, unavailable, () => found('jo')]
    const fetchFn = fakeFetch(async () => replies.shift()!())
    mount(store, fetchFn)
    act(() => store.getState().linkLetterboxd(idOf(store, 'Ann'), 'jo'))
    await flush()
    act(() => store.getState().startSpin())
    await wait(15_000)
    act(() => store.getState().newNight())
    await wait(30_000)
    expect(fetchFn).toHaveBeenCalledTimes(3)
    expect(linkOf(store, 'Ann')?.status).toBe('found')
  })

  it('checks two viewers independently', async () => {
    const store = storeWith('Ann', 'Bo')
    const fetchFn = fakeFetch(async (url) => (url.endsWith('/jo') ? unavailable() : found('sam')))
    mount(store, fetchFn)
    act(() => {
      store.getState().linkLetterboxd(idOf(store, 'Ann'), 'jo')
      store.getState().linkLetterboxd(idOf(store, 'Bo'), 'sam')
    })
    await flush()
    expect(linkOf(store, 'Bo')?.status).toBe('found')
    expect(linkOf(store, 'Ann')?.status).toBe('pending')
    expect(waitingIds()).toEqual([idOf(store, 'Ann')])
  })
})
