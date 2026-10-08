import { useEffect, useRef, useState } from 'react'
import { useApp } from '../state/store.ts'

interface Props {
  locked: boolean
  onChangeToken: () => void
}

// Mounted only while shown, so React state always matches whether the dialog
// is open; every way of closing it (Cancel, confirming, Escape) ends in the
// native `close` event, which unmounts it.
function EndNightDialog({ onConfirm, onClosed }: { onConfirm: () => void; onClosed: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])
  return (
    <dialog ref={ref} className="card confirm" aria-labelledby="end-night-heading" onClose={onClosed}>
      <h2 id="end-night-heading">End the night?</h2>
      <p>The night will end and the Night over summary will show.</p>
      <div className="confirm-actions">
        <button
          type="button"
          className="danger"
          onClick={() => {
            onConfirm()
            ref.current?.close()
          }}
        >
          End night
        </button>
        <button type="button" className="quiet" onClick={() => ref.current?.close()}>
          Cancel
        </button>
      </div>
    </dialog>
  )
}

export default function NightControls({ locked, onChangeToken }: Props) {
  const { night, endNight, newNight } = useApp()
  const [confirming, setConfirming] = useState(false)
  const menu = useRef<HTMLDivElement>(null)
  return (
    <div className="night-controls">
      {night.ended ? (
        <button type="button" className="night-control" disabled={locked} onClick={newNight}>
          <span aria-hidden="true">↻</span>
          <span className="label">New night</span>
        </button>
      ) : (
        <button
          type="button"
          className="night-control"
          disabled={locked}
          onClick={() => setConfirming(true)}
        >
          <span aria-hidden="true">■</span>
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
      {confirming && (
        <EndNightDialog onConfirm={endNight} onClosed={() => setConfirming(false)} />
      )}
    </div>
  )
}
