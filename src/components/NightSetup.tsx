import { useCallback, useEffect, useRef, useState, type FormEvent, type MouseEvent, type RefObject } from 'react'
import { maxNameLength, maxViewers } from '../state/model.ts'
import { useApp } from '../state/store.ts'
import type { TmdbClient } from '../tmdb/client.ts'
import { effectiveSetting } from '../wheel/edit.ts'
import { canHover, closeDelayMs } from './canHover.ts'
import { placeUnder } from './placePopover.ts'
import ViewerCell, { type CellStatus } from './ViewerCell.tsx'

interface Props {
  client: TmdbClient
  onAuthError: () => void
  locked?: boolean
  onHide: () => void
  // The Hide viewers button, for the app to focus after the Show viewers press.
  hideRef: RefObject<HTMLButtonElement | null>
}

// How long the pointer rests on a cell before it opens, and how long it must be
// gone before the cell closes.
const openDelayMs = 80

const rank: Record<CellStatus, number> = { wheel: 0, won: 1, away: 2 }

// The viewer pane: one cell per roster viewer, on the wheel first, then those
// who have won tonight, then those who are away. At most one cell is open.
export default function NightSetup({ client, onAuthError, locked = false, onHide, hideRef }: Props) {
  const { roster, night, settings, addViewer, resetAllViewerSettings } = useApp()
  const menu = useRef<HTMLDivElement>(null)
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

  const anyAdjusted = Object.keys(night.adjustments).length > 0
  // Array.prototype.sort is stable, so each group keeps roster order.
  const cells = roster
    .map((viewer) => ({ viewer, status: statusOf(viewer.id) }))
    .sort((a, b) => rank[a.status] - rank[b.status])

  function hide() {
    window.clearTimeout(timers.current.open)
    window.clearTimeout(timers.current.close)
    insideRef.current = null
    show(null)
    onHide()
  }

  function add(e: FormEvent) {
    e.preventDefault()
    addViewer(name)
    setName('')
  }

  return (
    <section className="card">
      <div className="pane-head">
        <h2>Tonight's viewers</h2>
        <button
          type="button"
          className="quiet"
          aria-label="More for all viewers"
          disabled={locked}
          popoverTarget="pane-menu"
          onClick={(e) => placeUnder(e, menu.current)}
        >
          <span aria-hidden="true">⋯</span>
        </button>
        <button
          type="button"
          ref={hideRef}
          className="quiet hide-viewers"
          aria-label="Hide viewers"
          onClick={hide}
        >
          <span aria-hidden="true">›</span>
        </button>
        <div id="pane-menu" popover="auto" ref={menu} className="card cell-menu">
          <button
            type="button"
            disabled={!anyAdjusted || locked}
            onClick={() => {
              menu.current?.hidePopover()
              resetAllViewerSettings()
            }}
          >
            Reset all slices and weights
          </button>
        </div>
      </div>
      <fieldset disabled={locked} className="setup">
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
              setting={effectiveSetting(settings.wheel, night.adjustments, viewer.id)}
              adjusted={night.adjustments[viewer.id] !== undefined}
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
      </fieldset>
    </section>
  )
}
