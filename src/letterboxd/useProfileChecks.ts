import { useEffect, useRef, useState } from 'react'
import { useApp } from '../state/store.ts'
import type { LetterboxdClient } from './client.ts'
import { retryDelaySeconds } from './retry.ts'

interface Job {
  username: string
  controller: AbortController | null
  timer: ReturnType<typeof setTimeout> | null
  attempt: number
}

function cancel(job: Job) {
  job.controller?.abort()
  if (job.timer !== null) clearTimeout(job.timer)
}

function withId(set: ReadonlySet<string>, id: string, has: boolean): ReadonlySet<string> {
  if (set.has(id) === has) return set
  const next = new Set(set)
  if (has) next.add(id)
  else next.delete(id)
  return next
}

// Checks every pending Letterboxd username in the background, at most one check per viewer,
// retrying an unavailable one on `retryDelaySeconds`. Returns the viewers with a retry waiting,
// kept in memory only. Mounted once, so the checks outlive the cell panels and the spin lock.
export function useProfileChecks(client: LetterboxdClient): ReadonlySet<string> {
  const { roster, setLetterboxdStatus } = useApp()
  const jobs = useRef(new Map<string, Job>())
  const [waiting, setWaiting] = useState<ReadonlySet<string>>(() => new Set())
  // The latest client and store action, read when a check runs.
  const latest = useRef({ client, setLetterboxdStatus })
  useEffect(() => {
    latest.current = { client, setLetterboxdStatus }
  })

  useEffect(() => {
    const running = jobs.current
    function drop(id: string) {
      const job = running.get(id)
      if (job) cancel(job)
      running.delete(id)
      setWaiting((w) => withId(w, id, false))
    }

    async function run(id: string, job: Job) {
      job.timer = null
      job.controller = new AbortController()
      let result
      try {
        result = await latest.current.client.checkProfile(job.username, job.controller.signal)
      } catch {
        return // aborted: the job was cancelled
      }
      if (running.get(id) !== job) return
      job.controller = null
      if (result === 'unavailable') {
        job.attempt += 1
        setWaiting((w) => withId(w, id, true))
        job.timer = setTimeout(() => void run(id, job), retryDelaySeconds(job.attempt) * 1000)
        return
      }
      running.delete(id)
      setWaiting((w) => withId(w, id, false))
      latest.current.setLetterboxdStatus(id, job.username, result)
    }

    const pending = new Map<string, string>()
    for (const v of roster) {
      if (v.letterboxd?.status === 'pending') pending.set(v.id, v.letterboxd.username)
    }
    for (const [id, job] of running) {
      if (pending.get(id) !== job.username) drop(id)
    }
    for (const [id, username] of pending) {
      if (running.has(id)) continue
      const job: Job = { username, controller: null, timer: null, attempt: 0 }
      running.set(id, job)
      void run(id, job)
    }
  }, [roster])

  useEffect(() => {
    const running = jobs.current
    return () => {
      for (const job of running.values()) cancel(job)
      running.clear()
    }
  }, [])

  return waiting
}
