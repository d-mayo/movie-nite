import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
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
  open,
  client,
  onAuthError,
  onHeaderClick,
}: Props) {
  const { setPresent, removeViewer, setViewerWeight, setViewerSlices } = useApp()
  const [confirming, setConfirming] = useState(false)
  const menu = useRef<HTMLDivElement>(null)
  const closeDialog = useCallback(() => setConfirming(false), [])
  const present = status !== 'away'
  const bodyId = `cell-body-${viewer.id}`
  return (
    <li className={`cell${status !== 'wheel' ? ' dimmed' : ''}${open ? ' open' : ''}`}>
      <div className="cell-head">
        <span className="cell-edge" aria-hidden="true" style={{ background: viewer.color }} />
        <button
          type="button"
          className="quiet cell-eye"
          aria-pressed={present}
          aria-label={`${viewer.name} is ${present ? 'here' : 'away'}`}
          onClick={() => setPresent(viewer.id, !present)}
        >
          <EyeIcon present={present} />
        </button>
        <button
          type="button"
          className="cell-header"
          aria-expanded={open}
          aria-controls={bodyId}
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
        <div id={bodyId} className="cell-body">
          {status === 'wheel' && (
            <NominationSearch
              viewerId={viewer.id}
              viewerName={viewer.name}
              client={client}
              onAuthError={onAuthError}
            />
          )}
          <div className="cell-tools">
            <ColorPicker viewer={viewer} roster={roster} />
            {status === 'wheel' && setting && (
              <>
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
              </>
            )}
            <button
              type="button"
              className="quiet"
              aria-label={`More for ${viewer.name}`}
              popoverTarget={`cell-menu-${viewer.id}`}
              onClick={(e) => placeUnder(e, menu.current)}
            >
              <span aria-hidden="true">⋯</span>
            </button>
            <div id={`cell-menu-${viewer.id}`} popover="auto" ref={menu} className="card cell-menu">
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
