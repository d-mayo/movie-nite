import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createMemoryPersistence } from '../state/persistence.ts'
import { AppStoreContext, createAppStore, type AppStore } from '../state/store.ts'
import type { LetterboxdClient, WatchlistPageResult } from './client.ts'
import { useWatchlistWalks } from './useWatchlistWalks.ts'
import { createWatchlistMemory, drawFromWatchlist, type WatchlistMemory } from './watchlist.ts'

interface Pending {
  username: string
  page: number
  resolve(result: WatchlistPageResult): void
}

// A client whose watchlist pages wait for the test to answer them, in the order they are asked.
function fakeClient() {
  const pending: Pending[] = []
  const asked: string[] = []
  const client: LetterboxdClient = {
    checkProfile: vi.fn(),
    watchlistPage: vi.fn(
      (username: string, page: number) =>
        new Promise<WatchlistPageResult>((resolve) => {
          asked.push(`${username}:${page}`)
          pending.push({ username, page, resolve })
        }),
    ),
    listPage: vi.fn(),
    filmTmdbId: vi.fn(),
    filmSlug: vi.fn(),
  }
  const answer = async (result: WatchlistPageResult) => {
    const next = pending.shift()!
    await act(async () => {
      next.resolve(result)
    })
  }
  return { client, asked, answer, pending }
}

function Probe({ client, memory }: { client: LetterboxdClient; memory: WatchlistMemory }) {
  const settled = useWatchlistWalks({ client, memory })
  return <output data-testid="settled">{[...settled].map(([user, slugs]) => `${user}=${slugs.join('+')}`).join(' ')}</output>
}

const settledText = () => screen.getByTestId('settled').textContent

function setup(...names: string[]) {
  const store = createAppStore(createMemoryPersistence())
  for (const name of names) {
    store.getState().addViewer(name)
    const id = store.getState().roster.find((v) => v.name === name)!.id
    store.getState().linkLetterboxd(id, name.toLowerCase())
    store.getState().setLetterboxdStatus(id, name.toLowerCase(), 'found')
  }
  return store
}

const idOf = (store: AppStore, name: string) => store.getState().roster.find((v) => v.name === name)!.id

function mount(store: AppStore, client: LetterboxdClient, memory = createWatchlistMemory()) {
  render(
    <AppStoreContext.Provider value={store}>
      <Probe client={client} memory={memory} />
    </AppStoreContext.Provider>,
  )
  return memory
}

const flush = () => act(async () => {})
const done = (...slugs: string[]): WatchlistPageResult => ({ slugs, hasNext: false })

describe('useWatchlistWalks', () => {
  it('walks present found viewers in roster order, one at a time', async () => {
    const { client, asked, answer } = fakeClient()
    mount(setup('Ann', 'Bo'), client)
    await flush()
    expect(asked).toEqual(['ann:1'])
    await answer({ slugs: ['a'], hasNext: true })
    expect(asked).toEqual(['ann:1', 'ann:2'])
    await answer(done('b'))
    expect(asked).toEqual(['ann:1', 'ann:2', 'bo:1'])
    expect(settledText()).toBe('ann=a+b')
    await answer(done('c'))
    expect(settledText()).toBe('ann=a+b bo=c')
  })

  it('skips away, unlinked, pending and missing viewers', async () => {
    const store = setup('Ann', 'Bo', 'Cy', 'Di', 'Ed')
    store.getState().setPresent(idOf(store, 'Ann'), false)
    store.getState().unlinkLetterboxd(idOf(store, 'Bo'))
    store.getState().setLetterboxdStatus(idOf(store, 'Cy'), 'cy', 'missing')
    store.getState().linkLetterboxd(idOf(store, 'Di'), 'di2')
    const { client, asked } = fakeClient()
    mount(store, client)
    await flush()
    expect(asked).toEqual(['ed:1'])
  })

  it('queues a viewer who becomes present or found later, and walks a won-tonight viewer', async () => {
    const store = setup('Ann', 'Bo')
    store.getState().setPresent(idOf(store, 'Bo'), false)
    const { client, asked, answer } = fakeClient()
    mount(store, client)
    await flush()
    await answer(done('a'))
    expect(asked).toEqual(['ann:1'])
    act(() => store.getState().setPresent(idOf(store, 'Bo'), true))
    await flush()
    expect(asked).toEqual(['ann:1', 'bo:1'])
    await answer(done('b'))

    act(() => store.getState().addViewer('Cy'))
    await flush()
    const cy = idOf(store, 'Cy')
    act(() => store.getState().linkLetterboxd(cy, 'cy'))
    await flush()
    expect(asked).toEqual(['ann:1', 'bo:1'])
    act(() => store.getState().setLetterboxdStatus(cy, 'cy', 'found'))
    await flush()
    expect(asked).toEqual(['ann:1', 'bo:1', 'cy:1'])
  })

  it('reuses a walk a draw began, and walks a username once however it ends', async () => {
    const store = setup('Ann', 'Bo')
    const { client, asked, pending } = fakeClient()
    const memory = createWatchlistMemory()
    void drawFromWatchlist({ client, memory, username: 'Bo', excluded: new Set(), random: () => 0 })
    mount(store, client, memory)
    await flush()
    expect(asked).toEqual(['bo:1', 'ann:1'])
    const [boPage, annPage] = pending.splice(0)
    await act(async () => annPage.resolve('private'))
    await flush()
    // Bo's draw walk is still under way, so the background shares it.
    expect(asked).toEqual(['bo:1', 'ann:1'])
    await act(async () => boPage.resolve(done('x')))
    expect(settledText()).toBe('bo=x')
    act(() => store.getState().setPresent(idOf(store, 'Ann'), false))
    act(() => store.getState().setPresent(idOf(store, 'Ann'), true))
    await flush()
    expect(client.watchlistPage).toHaveBeenCalledTimes(2)
  })

  it('does not keep an empty or failed background walk for a draw', async () => {
    const store = setup('Ann')
    const { client, answer } = fakeClient()
    const memory = mount(store, client)
    await flush()
    await answer(done())
    expect(memory.walks.has('ann')).toBe(false)
    expect(settledText()).toBe('ann=')
  })
})
