import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent, type RefObject } from 'react'
import { maxNameLength, maxViewers } from '../state/model.ts'
import { useApp } from '../state/store.ts'
import type { TmdbClient } from '../tmdb/client.ts'
import { effectiveSetting } from '../wheel/edit.ts'
import { canHover, closeDelayMs } from './canHover.ts'
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

// The + in the pane's header and the name popup it opens. A full roster keeps
// the button focusable (aria-disabled) so its tooltip reaches the keyboard, and
// opens nothing; a spin disables it outright.
function AddViewer({ locked }: { locked: boolean }) {
  const { roster, addViewer } = useApp()
  const popup = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const full = roster.length >= maxViewers

  useEffect(() => {
    const el = popup.current
    if (!el) return
    function onToggle(e: Event) {
      if ((e as Event & { newState?: string }).newState !== 'open') return
      setName('')
      setError('')
      field.current?.focus()
    }
    el.addEventListener('toggle', onToggle)
    return () => el.removeEventListener('toggle', onToggle)
  }, [])
  useEffect(() => {
    if (locked) popup.current?.hidePopover()
  }, [locked])

  function submit(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (trimmed === '') {
      setError('Enter a name.')
      return
    }
    const taken = roster.find((v) => v.name.toLowerCase() === trimmed.toLowerCase())
    if (taken) {
      setError(`${taken.name} is already on the roster.`)
      return
    }
    addViewer(trimmed)
    popup.current?.hidePopover()
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') popup.current?.hidePopover()
  }

  return (
    <>
      <button
        type="button"
        className="quiet pane-icon add-viewer"
        aria-label="Add a viewer"
        disabled={locked}
        aria-disabled={full ? 'true' : undefined}
        aria-describedby={full ? 'roster-full-tip' : undefined}
        popoverTarget={full || locked ? undefined : 'add-viewer-popup'}
      >
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M8 3v10M3 8h10" />
        </svg>
        {full && (
          <span id="roster-full-tip" role="tooltip" className="tip">
            The roster is full
          </span>
        )}
      </button>
      <div id="add-viewer-popup" popover="auto" ref={popup} className="card add-popup" onKeyDown={onKeyDown}>
        <form onSubmit={submit} noValidate>
          <label>
            Name
            <input
              ref={field}
              maxLength={maxNameLength}
              value={name}
              aria-describedby={error ? 'add-viewer-error' : undefined}
              aria-invalid={error ? true : undefined}
              onChange={(e) => {
                setName(e.target.value)
                setError('')
              }}
            />
          </label>
          {error && (
            <p id="add-viewer-error" role="alert" className="field-error">
              {error}
            </p>
          )}
        </form>
      </div>
    </>
  )
}

// Mounted only while shown, like the Remove dialog: Cancel and confirming
// unmount it directly, and Escape does so through the native `close` event.
function ResetAllDialog({ onConfirm, onClosed }: { onConfirm: () => void; onClosed: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    dialog.addEventListener('close', onClosed)
    return () => dialog.removeEventListener('close', onClosed)
  }, [onClosed])
  function dismiss() {
    ref.current?.close()
    onClosed()
  }
  return (
    <dialog ref={ref} className="card confirm" aria-labelledby="reset-all-heading">
      <h2 id="reset-all-heading">Reset every viewer's slices and weight?</h2>
      <p>Everyone goes back to the defaults in Wheel settings.</p>
      <div className="confirm-actions">
        <button
          type="button"
          className="danger"
          onClick={() => {
            onConfirm()
            dismiss()
          }}
        >
          Reset
        </button>
        <button type="button" className="quiet" onClick={dismiss}>
          Cancel
        </button>
      </div>
    </dialog>
  )
}

// The viewer pane: one cell per roster viewer, on the wheel first, then those
// who have won tonight, then those who are away. At most one cell is open.
export default function NightSetup({ client, onAuthError, locked = false, onHide, hideRef }: Props) {
  const { roster, night, settings, resetAllViewerSettings } = useApp()
  const [resetting, setResetting] = useState(false)
  const closeReset = useCallback(() => setResetting(false), [])
  // No confirmation stays pending through a spin.
  if (locked && resetting) setResetting(false)
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
    if (lockedRef.current || !canHover() || !canOpen(id)) return
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
    if (lockedRef.current || !canOpen(id)) return
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

  function hasWon(viewerId: string): boolean {
    const film = night.nominations[viewerId]
    return film !== undefined && night.wonFilms.includes(film.tmdbId)
  }

  function statusOf(viewerId: string): CellStatus {
    if (!night.presentIds.includes(viewerId)) return 'away'
    return hasWon(viewerId) ? 'won' : 'wheel'
  }

  // Only a viewer on the wheel has a cell that opens.
  function canOpen(viewerId: string): boolean {
    return statusOf(viewerId) === 'wheel'
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

  return (
    <section className="card">
      <div className="pane-head">
        <div className="pane-title">
          <h2>Tonight's viewers</h2>
          <p className="headcount">Headcount: {night.presentIds.length}</p>
        </div>
        <AddViewer locked={locked} />
        <button
          type="button"
          className="quiet pane-icon"
          aria-label="Reset all slices and weights"
          disabled={!anyAdjusted || locked}
          onClick={() => setResetting(true)}
        >
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 8a5 5 0 1 0 1.6-3.7" />
            <path d="M3 2.5v3h3" />
          </svg>
        </button>
        <button
          type="button"
          ref={hideRef}
          className="quiet pane-icon hide-viewers"
          aria-label="Hide viewers"
          onClick={hide}
        >
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 3l5 5-5 5" />
          </svg>
        </button>
      </div>
      <fieldset disabled={locked} className="setup">
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
      </fieldset>
      {resetting && <ResetAllDialog onConfirm={resetAllViewerSettings} onClosed={closeReset} />}
    </section>
  )
}
