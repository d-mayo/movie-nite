import { useEffect, useRef, useState } from 'react'
import { useApp } from '../state/store.ts'
import { ensureWalk, subscribeToSettled, type WatchlistSource } from './watchlist.ts'

export type SettledWalks = ReadonlyMap<string, readonly string[]>

// Walks, in the background, the watchlist of every present viewer whose Letterboxd profile is found: in roster order,
// one viewer at a time, each username started at most once a session whatever the outcome. A walk already kept (from a
// draw) or under way is reused. Returns the settled walks by username, copied afresh whenever one settles. Mounted
// once, so the walks outlive the cell panels and the spin lock.
export function useWatchlistWalks({ client, memory }: Pick<WatchlistSource, 'client' | 'memory'>): SettledWalks {
  const { roster, night } = useApp()
  const [settled, setSettled] = useState<SettledWalks>(() => new Map(memory.settled))
  const started = useRef(new Set<string>())
  const pumping = useRef(false)
  const alive = useRef(false)
  // The usernames to walk now, in roster order, and the latest client, read as the queue advances.
  const latest = useRef({ client, memory, eligible: [] as string[] })

  const eligible: string[] = []
  for (const viewer of roster) {
    if (viewer.letterboxd?.status !== 'found' || !night.presentIds.includes(viewer.id)) continue
    const username = viewer.letterboxd.username.toLowerCase()
    if (!eligible.includes(username)) eligible.push(username)
  }
  const eligibleKey = eligible.join(',')

  useEffect(() => {
    latest.current = { client, memory, eligible: eligibleKey ? eligibleKey.split(',') : [] }
  })

  useEffect(() => {
    const sync = () => setSettled(new Map(memory.settled))
    sync()
    return subscribeToSettled(memory, sync)
  }, [memory])

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => {
    if (pumping.current) return
    pumping.current = true
    void (async () => {
      try {
        for (;;) {
          const { client: c, memory: m, eligible: now } = latest.current
          const next = now.find((username) => !started.current.has(username))
          if (next === undefined || !alive.current) return
          started.current.add(next)
          await ensureWalk(c, m, next)
        }
      } finally {
        pumping.current = false
      }
    })()
  }, [eligibleKey, memory])

  return settled
}
