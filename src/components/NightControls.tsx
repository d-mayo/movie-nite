import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '../state/store.ts'
import WheelEditor from './WheelEditor.tsx'

interface Props {
  locked: boolean
  onChangeToken: () => void
}

// Mounted only while shown, so React state always matches whether the dialog
// is open: Cancel and confirming unmount it directly, and Escape does so
// through the native `close` event.
function EndNightDialog({ onConfirm, onClosed }: { onConfirm: () => void; onClosed: () => void }) {
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
    <dialog ref={ref} className="card confirm" aria-labelledby="end-night-heading">
      <h2 id="end-night-heading">End the night?</h2>
      <p>The night will end and the Night over summary will show.</p>
      <div className="confirm-actions">
        <button
          type="button"
          className="danger"
          onClick={() => {
            onConfirm()
            dismiss()
          }}
        >
          End night
        </button>
        <button type="button" className="quiet" onClick={dismiss}>
          Cancel
        </button>
      </div>
    </dialog>
  )
}

export default function NightControls({ locked, onChangeToken }: Props) {
  const { night, endNight, newNight } = useApp()
  const [confirming, setConfirming] = useState(false)
  const [editing, setEditing] = useState(false)
  const menu = useRef<HTMLDivElement>(null)
  const closeDialog = useCallback(() => setConfirming(false), [])
  const closeDrawer = useCallback(() => setEditing(false), [])
  return (
    <div className="night-controls">
      <button
        type="button"
        className="quiet night-control"
        disabled={locked || night.ended}
        onClick={() => setEditing(true)}
      >
        <span className="icon" aria-hidden="true">◐</span>
        <span className="label">Wheel settings</span>
      </button>
      {night.ended ? (
        <button type="button" className="quiet night-control" disabled={locked} onClick={newNight}>
          <span className="icon" aria-hidden="true">↻</span>
          <span className="label">New night</span>
        </button>
      ) : (
        <button
          type="button"
          className="quiet night-control"
          disabled={locked}
          onClick={() => setConfirming(true)}
        >
          <span className="icon" aria-hidden="true">☾</span>
          <span className="label">End night</span>
        </button>
      )}
      <button
        type="button"
        className="quiet"
        aria-label="Settings"
        popoverTarget="settings-menu"
        disabled={locked}
      >
        <span aria-hidden="true">⚙</span>
      </button>
      <div id="settings-menu" popover="auto" ref={menu} className="card settings-menu">
        <button
          type="button"
          onClick={() => {
            menu.current?.hidePopover()
            onChangeToken()
          }}
        >
          Change TMDB token
        </button>
      </div>
      {editing && <WheelEditor locked={locked} onClosed={closeDrawer} />}
      {confirming && (
        <EndNightDialog onConfirm={endNight} onClosed={closeDialog} />
      )}
    </div>
  )
}
