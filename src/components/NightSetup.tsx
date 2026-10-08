import { useCallback, useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import { maxNameLength, maxViewers, viewersOnWheel } from '../state/model.ts'
import { useApp } from '../state/store.ts'
import type { TmdbClient } from '../tmdb/client.ts'
import { materialiseDefault } from '../wheel/edit.ts'
import { canHover } from './canHover.ts'
import { WatchNextSession } from './NightOver.tsx'
import ViewerCell, { type CellStatus } from './ViewerCell.tsx'

interface Props {
  client: TmdbClient
  onAuthError: () => void
  locked?: boolean
}

// How long the pointer rests on a cell before it opens, and how long it must be
// gone before the cell closes.
const openDelayMs = 150
const closeDelayMs = 300

const rank: Record<CellStatus, number> = { wheel: 0, won: 1, away: 2 }

// The viewer pane: one cell per roster viewer, on the wheel first, then those
// who have won tonight, then those who are away. At most one cell is open.
export default function NightSetup({ client, onAuthError, locked = false }: Props) {
  const { roster, night, addViewer } = useApp()
  const [name, setName] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  // Nothing opens during a spin or its reveal, and the open cell closes.
  if (locked && openId !== null) setOpenId(null)
  const shownId = locked ? null : openId

  // The timers read these, so they see the latest values.
  const openRef = useRef<string | null>(null)
  const lockedRef = useRef(locked)
  const heldRef = useRef<string | null>(null)
  const insideRef = useRef<string | null>(null)
  const timers = useRef<{ open?: number; close?: number }>({})
  useEffect(() => {
    openRef.current = shownId
    lockedRef.current = locked
  })
  useEffect(() => {
    const pending = timers.current
    return () => {
      window.clearTimeout(pending.open)
      window.clearTimeout(pending.close)
    }
  }, [])
  useEffect(() => {
    if (!locked) return
    window.clearTimeout(timers.current.open)
    window.clearTimeout(timers.current.close)
  }, [locked])

  const show = useCallback((id: string | null) => {
    openRef.current = id
    setOpenId(id)
  }, [])

  const scheduleClose = useCallback(
    (id: string) => {
      window.clearTimeout(timers.current.close)
      timers.current.close = window.setTimeout(() => {
        if (openRef.current === id && heldRef.current !== id && insideRef.current !== id) show(null)
      }, closeDelayMs)
    },
    [show],
  )

  function hoverStart(id: string) {
    insideRef.current = id
    if (lockedRef.current || !canHover() || isAway(id)) return
    if (openRef.current === id) {
      window.clearTimeout(timers.current.close)
      return
    }
    // A cell held open by a drag, focus or overlay is not displaced by hover.
    if (heldRef.current !== null) return
    window.clearTimeout(timers.current.open)
    timers.current.open = window.setTimeout(() => {
      if (!lockedRef.current && heldRef.current === null && insideRef.current === id) show(id)
    }, openDelayMs)
  }

  function hoverEnd(id: string) {
    if (insideRef.current === id) insideRef.current = null
    window.clearTimeout(timers.current.open)
    if (canHover() && openRef.current === id) scheduleClose(id)
  }

  // With a mouse a click only opens a cell, since moving away is how it closes;
  // a tap and the keyboard (a click with no detail) toggle it.
  function headerClick(id: string, e: MouseEvent<HTMLButtonElement>) {
    if (lockedRef.current || isAway(id)) return
    window.clearTimeout(timers.current.open)
    window.clearTimeout(timers.current.close)
    const mouse = canHover() && e.detail > 0
    show(mouse || openRef.current !== id ? id : null)
  }

  const hold = useCallback((id: string, held: boolean) => {
    if (held) {
      heldRef.current = id
      return
    }
    if (heldRef.current === id) heldRef.current = null
    if (canHover() && openRef.current === id && insideRef.current !== id) scheduleClose(id)
  }, [scheduleClose])

  function isAway(viewerId: string): boolean {
    return !night.presentIds.includes(viewerId)
  }

  function hasWon(viewerId: string): boolean {
    const film = night.nominations[viewerId]
    return film !== undefined && night.wonFilms.includes(film.tmdbId)
  }

  function statusOf(viewerId: string): CellStatus {
    if (!night.presentIds.includes(viewerId)) return 'away'
    return hasWon(viewerId) ? 'won' : 'wheel'
  }

  const layout = night.layout ?? materialiseDefault(viewersOnWheel(night))
  // Array.prototype.sort is stable, so each group keeps roster order.
  const cells = roster
    .map((viewer) => ({ viewer, status: statusOf(viewer.id) }))
    .sort((a, b) => rank[a.status] - rank[b.status])

  function add(e: FormEvent) {
    e.preventDefault()
    addViewer(name)
    setName('')
  }

  return (
    <section className="card">
      <fieldset disabled={locked} className="setup">
        <h2>Tonight's viewers</h2>
        <p>Headcount: {night.presentIds.length}</p>
        <ul className="viewer-cells">
          {cells.map(({ viewer, status }) => (
            <ViewerCell
              key={viewer.id}
              viewer={viewer}
              roster={roster}
              status={status}
              won={hasWon(viewer.id)}
              film={night.nominations[viewer.id]}
              setting={layout.viewers[viewer.id]}
              open={shownId === viewer.id}
              client={client}
              onAuthError={onAuthError}
              onHeaderClick={(e) => headerClick(viewer.id, e)}
              onPresenceChange={() => {
                if (openRef.current === viewer.id) show(null)
              }}
              onHoverStart={() => hoverStart(viewer.id)}
              onHoverEnd={() => hoverEnd(viewer.id)}
              onHold={hold}
            />
          ))}
        </ul>
        <form onSubmit={add}>
          <label>
            Add a viewer
            <input maxLength={maxNameLength} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <button type="submit" className="primary" disabled={roster.length >= maxViewers}>
            Add
          </button>
          {roster.length >= maxViewers && (
            <p>The roster is full (12 viewers). Remove a viewer to add another.</p>
          )}
        </form>
        <WatchNextSession />
      </fieldset>
    </section>
  )
}
