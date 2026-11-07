import { useEffect, useRef } from 'react'
import { useApp } from '../state/store.ts'
import { cards } from '../wildcards/cards.ts'
import { closeCallMinSpinSeconds } from '../wheel/closeCall.ts'
import type { DebugOptions } from './debugOptions.ts'

interface Props {
  options: DebugOptions
  onChange: (change: Partial<DebugOptions>) => void
  locked: boolean
  onClosed: () => void
}

// The debug overlay, mounted only while shown, like Choose cards: Done unmounts it directly,
// Escape does so through the native `close` event, and a press outside its box closes it too.
export default function DebugMenu({ options, onChange, locked, onClosed }: Props) {
  const { settings } = useApp()
  const ref = useRef<HTMLDialogElement>(null)
  // True from a press on the backdrop, outside the box, until its click.
  const outsidePress = useRef(false)
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
  // A modal backdrop's events target the dialog, so outside is found by position.
  function inside(x: number, y: number) {
    const r = ref.current?.getBoundingClientRect()
    return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
  }
  const closeCallsAvailable = settings.wheel.spinSeconds >= closeCallMinSpinSeconds
  return (
    <dialog
      ref={ref}
      className="card card-switches debug-switches"
      aria-labelledby="debug-options-heading"
      onPointerDown={(e) => {
        outsidePress.current = e.target === e.currentTarget && !inside(e.clientX, e.clientY)
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && outsidePress.current) dismiss()
        outsidePress.current = false
      }}
    >
      <div className="card-switches-head">
        <h2 id="debug-options-heading">Debug options</h2>
        <button type="button" className="quiet" onClick={dismiss}>
          Done
        </button>
      </div>
      <div className="card-switches-body">
        <fieldset className="inset-card" disabled={locked} aria-labelledby="debug-spin-heading">
          <div className="card-head">
            <h3 id="debug-spin-heading">Spin</h3>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              role="switch"
              checked={options.closeCalls}
              disabled={!closeCallsAvailable}
              onChange={(e) => onChange({ closeCalls: e.target.checked })}
            />
            Force close calls
            {!closeCallsAvailable && ` (needs a spin Length of ${closeCallMinSpinSeconds} s or more)`}
          </label>
          <label className="switch">
            <input
              type="checkbox"
              role="switch"
              checked={options.catches}
              onChange={(e) => onChange({ catches: e.target.checked })}
            />
            Force catches
          </label>
          <label className="switch">
            <input
              type="checkbox"
              role="switch"
              checked={options.countdowns}
              onChange={(e) => onChange({ countdowns: e.target.checked })}
            />
            Force countdowns
          </label>
        </fieldset>
        <fieldset className="inset-card" disabled={locked} aria-labelledby="debug-wildcards-heading">
          <div className="card-head">
            <h3 id="debug-wildcards-heading">Wildcards</h3>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              role="switch"
              checked={options.wildcards}
              onChange={(e) => onChange({ wildcards: e.target.checked })}
            />
            Force wildcards
          </label>
          <label className="debug-select">
            Force card
            <select value={options.card} onChange={(e) => onChange({ card: e.target.value })}>
              <option value="">Random deal</option>
              {cards.filter((c) => !c.fff || settings.fffUnlocked).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
      </div>
    </dialog>
  )
}
