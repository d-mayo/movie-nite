import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useApp } from '../state/store.ts'
import { canHover, closeDelayMs } from './canHover.ts'
import WheelEditor from './WheelEditor.tsx'

interface Props {
  locked: boolean
  // The held film's chip, which sits first in the toolbar.
  heldFilmChip?: ReactNode
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

export default function NightControls({ locked, heldFilmChip, onChangeToken }: Props) {
  const { night, endNight, newNight } = useApp()
  const [confirming, setConfirming] = useState(false)
  const [editing, setEditing] = useState(false)
  const menu = useRef<HTMLDivElement>(null)
  const gear = useRef<HTMLButtonElement>(null)
  // The gear menu closes shortly after the pointer leaves it, once it has been inside.
  const menuInside = useRef(false)
  const menuTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearMenuTimer = () => {
    if (menuTimer.current) clearTimeout(menuTimer.current)
    menuTimer.current = null
  }
  useEffect(() => clearMenuTimer, [])
  const closeDialog = useCallback(() => setConfirming(false), [])
  const closeDrawer = useCallback(() => {
    setEditing(false)
    gear.current?.focus()
  }, [])
  return (
    <div className="night-controls">
      {heldFilmChip}
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
        ref={gear}
        className={editing ? 'quiet active' : 'quiet'}
        aria-label="Settings"
        popoverTarget="settings-menu"
        disabled={locked}
      >
        <span aria-hidden="true">⚙</span>
      </button>
      <div id="settings-menu" popover="auto" ref={menu} className="card settings-menu"
        onToggle={(e) => {
          if ((e as unknown as { newState: string }).newState === 'closed') {
            menuInside.current = false
            clearMenuTimer()
          }
        }}
        onPointerEnter={() => {
          menuInside.current = true
          clearMenuTimer()
        }}
        onPointerLeave={() => {
          if (!menuInside.current || !canHover()) return
          clearMenuTimer()
          menuTimer.current = setTimeout(() => menu.current?.hidePopover(), closeDelayMs)
        }}
      >
        <button
          type="button"
          disabled={night.ended}
          onClick={() => {
            menu.current?.hidePopover()
            setEditing(true)
          }}
        >
          Wheel settings
        </button>
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
      {editing && <WheelEditor locked={locked} onClosed={closeDrawer} anchor={gear} />}
      {confirming && (
        <EndNightDialog onConfirm={endNight} onClosed={closeDialog} />
      )}
    </div>
  )
}
