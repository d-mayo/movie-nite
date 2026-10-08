import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type MouseEvent,
  type PointerEvent,
  type SyntheticEvent,
} from 'react'
import type { Nomination, Viewer } from '../state/model.ts'
import { useApp } from '../state/store.ts'
import type { TmdbClient } from '../tmdb/client.ts'
import type { ViewerSetting } from '../wheel/edit.ts'
import ColorPicker from './ColorPicker.tsx'
import { Poster } from './FilmSearch.tsx'
import NominationSearch from './NominationSearch.tsx'
import { filmLabel } from './NightOver.tsx'
import { placeUnder } from './placePopover.ts'
import Slider from './Slider.tsx'

// Matches the 900 px breakpoint in App.css where the pane sits beside the wheel.
const wideScreenPx = 900

export type CellStatus = 'wheel' | 'won' | 'away'

interface Props {
  viewer: Viewer
  roster: Viewer[]
  status: CellStatus
  // Whether the viewer has won tonight, even if they were then marked away.
  won: boolean
  film: Nomination | undefined
  // The saved layout's numbers, or the default's while the wheel is derived.
  setting: ViewerSetting | undefined
  open: boolean
  client: TmdbClient
  onAuthError: () => void
  onHeaderClick: (e: MouseEvent<HTMLButtonElement>) => void
  // Called when the eye toggle is used, which closes the cell.
  onPresenceChange: () => void
  onHoverStart: () => void
  onHoverEnd: () => void
  // Reports whether something keeps the open cell open whatever the pointer does.
  onHold: (id: string, held: boolean) => void
}

// True for focus a keyboard (or a text field) put there, not a click left behind.
function focusVisible(el: Element): boolean {
  try {
    return el.matches(':focus-visible')
  } catch {
    return false
  }
}

function EyeIcon({ present }: { present: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {!present && <path d="M3 3l18 18" />}
    </svg>
  )
}

// Mounted only while shown, like the End night dialog: Cancel and confirming
// unmount it directly, and Escape does so through the native `close` event.
function RemoveDialog({
  name,
  onConfirm,
  onClosed,
}: {
  name: string
  onConfirm: () => void
  onClosed: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    dialog.addEventListener('close', onClosed)
    return () => dialog.removeEventListener('close', onClosed)
  }, [onClosed])
  // Close natively, then unmount at once rather than wait for the `close` event.
  function dismiss() {
    ref.current?.close()
    onClosed()
  }
  return (
    <dialog ref={ref} className="card confirm" aria-labelledby="remove-viewer-heading">
      <h2 id="remove-viewer-heading">Remove {name} from the roster?</h2>
      <div className="confirm-actions">
        <button
          type="button"
          className="danger"
          onClick={() => {
            onConfirm()
            dismiss()
          }}
        >
          Remove
        </button>
        <button type="button" className="quiet" onClick={dismiss}>
          Cancel
        </button>
      </div>
    </dialog>
  )
}

export default function ViewerCell({
  viewer,
  roster,
  status,
  won,
  film,
  setting,
  open: openRequested,
  client,
  onAuthError,
  onHeaderClick,
  onPresenceChange,
  onHoverStart,
  onHoverEnd,
  onHold,
}: Props) {
  const { setPresent, removeViewer, setViewerWeight, setViewerSlices } = useApp()
  // A viewer who is away has nothing to open: no body, no menu.
  const expandable = status !== 'away'
  const open = openRequested && expandable
  const [confirming, setConfirming] = useState(false)
  const menu = useRef<HTMLDivElement>(null)
  const item = useRef<HTMLLIElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const closeDialog = useCallback(() => setConfirming(false), [])
  // Each of these keeps an open cell open: a slider being dragged, keyboard
  // focus inside, a popover or the Remove confirmation being open.
  const [dragging, setDragging] = useState(false)
  const [focusHeld, setFocusHeld] = useState(false)
  const [overlays, setOverlays] = useState<Record<string, boolean>>({})
  // The body unmounts when the cell closes, taking its holds with it.
  const [wasOpen, setWasOpen] = useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (!open) {
      setDragging(false)
      setFocusHeld(false)
      setOverlays({})
    }
  }
  const held = open && (dragging || focusHeld || confirming || Object.values(overlays).some(Boolean))
  useEffect(() => {
    onHold(viewer.id, held)
    return () => onHold(viewer.id, false)
  }, [held, onHold, viewer.id])
  useEffect(() => {
    if (!dragging) return
    const end = () => setDragging(false)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [dragging])
  const track = (name: string) => (e: SyntheticEvent) => {
    const shown = (e.nativeEvent as Event & { newState?: string }).newState === 'open'
    setOverlays((o) => ({ ...o, [name]: shown }))
  }
  // On wide screens the open body floats to the left of the viewer pane, so it
  // covers no other viewer and is not clipped by the pane's scrolling list.
  useLayoutEffect(() => {
    const el = body.current
    const cellEl = item.current
    if (!open || !el || !cellEl) return
    function place() {
      if (!el || !cellEl) return
      const pane = cellEl.closest('.card')
      const wide = window.innerWidth >= wideScreenPx && pane
      if (!wide) {
        el.removeAttribute('data-floating')
        el.style.cssText = ''
        return
      }
      // Flush against the cell's left edge, so the two read as one shape.
      const cellRect = cellEl.getBoundingClientRect()
      const width = Math.min(22 * 16, cellRect.left - 16)
      el.dataset.floating = 'true'
      el.style.position = 'fixed'
      el.style.width = `${width}px`
      el.style.minHeight = `${cellRect.height}px`
      el.style.left = `${cellRect.left - width}px`
      el.style.right = 'auto'
      el.style.bottom = 'auto'
      const room = window.innerHeight - el.offsetHeight - 8
      el.style.top = `${Math.max(8, Math.min(cellRect.top, room))}px`
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])
  const present = status !== 'away'
  const bodyId = `cell-body-${viewer.id}`
  return (
    <li
      ref={item}
      className={`cell${status !== 'wheel' ? ' dimmed' : ''}${open ? ' open' : ''}`}
      style={{ '--viewer-color': viewer.color } as CSSProperties}
      onPointerEnter={onHoverStart}
      onPointerLeave={onHoverEnd}
      onFocus={(e: FocusEvent<HTMLElement>) => setFocusHeld(focusVisible(e.target))}
      onBlur={(e: FocusEvent<HTMLElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusHeld(false)
      }}
    >
      <div className="cell-head">
        <span className="cell-edge" aria-hidden="true" style={{ background: viewer.color }} />
        <button
          type="button"
          className="quiet cell-eye"
          aria-pressed={present}
          aria-label={`${viewer.name} is ${present ? 'here' : 'away'}`}
          onClick={() => {
            setPresent(viewer.id, !present)
            onPresenceChange()
          }}
        >
          <EyeIcon present={present} />
        </button>
        <button
          type="button"
          className="cell-header"
          aria-expanded={expandable ? open : undefined}
          aria-controls={expandable ? bodyId : undefined}
          onClick={onHeaderClick}
        >
          <strong className="cell-name">{viewer.name}</strong>
          <span className="cell-film">
            {film ? (
              <>
                <Poster path={film.posterPath} title={film.title} />
                <span>{filmLabel(film)}</span>
              </>
            ) : (
              status === 'wheel' && <span>No film yet</span>
            )}
          </span>
          {won ? (
            <span className="cell-tag">Won tonight</span>
          ) : (
            status === 'wheel' &&
            setting && (
              <span className="cell-summary">
                {setting.slices} {setting.slices === 1 ? 'slice' : 'slices'} · weight {setting.weight}
              </span>
            )
          )}
        </button>
      </div>
      {open && (
        <div
          id={bodyId}
          ref={body}
          className="cell-body"
          onPointerDown={(e: PointerEvent<HTMLElement>) => {
            if ((e.target as Element).matches('input[type="range"]')) setDragging(true)
          }}
        >
          {status === 'wheel' && (
            <NominationSearch
              viewerId={viewer.id}
              viewerName={viewer.name}
              client={client}
              onAuthError={onAuthError}
            />
          )}
          <div className="cell-options">
            <span className="cell-colour">
              <ColorPicker viewer={viewer} roster={roster} onToggle={track('color')} />
              <span aria-hidden="true">Colour</span>
            </span>
            <button
              type="button"
              className="quiet"
              aria-label={`More for ${viewer.name}`}
              popoverTarget={`cell-menu-${viewer.id}`}
              onClick={(e) => placeUnder(e, menu.current)}
            >
              <span aria-hidden="true">⋯</span>
            </button>
            <div
              id={`cell-menu-${viewer.id}`}
              popover="auto"
              ref={menu}
              className="card cell-menu"
              onToggle={track('menu')}
            >
              <button
                type="button"
                onClick={() => {
                  menu.current?.hidePopover()
                  setConfirming(true)
                }}
              >
                Remove from roster
              </button>
            </div>
          </div>
          {status === 'wheel' && setting && (
            <div className="cell-sliders">
              <Slider
                label={`Slices for ${viewer.name}`}
                value={setting.slices}
                step={1}
                min={1}
                max={12}
                onChange={(n) => setViewerSlices(viewer.id, n)}
              />
              <Slider
                label={`Weight for ${viewer.name}`}
                value={setting.weight}
                step={0.5}
                min={0.5}
                max={20}
                onChange={(n) => setViewerWeight(viewer.id, n)}
              />
            </div>
          )}
        </div>
      )}
      {confirming && (
        <RemoveDialog
          name={viewer.name}
          onConfirm={() => removeViewer(viewer.id)}
          onClosed={closeDialog}
        />
      )}
    </li>
  )
}
