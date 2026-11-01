import { useApp } from '../state/store.ts'
import { cards } from '../wildcards/cards.ts'
import { closeCallMinSpinSeconds } from '../wheel/closeCall.ts'
import type { DebugOptions } from './debugOptions.ts'
import { useHungPopover } from './useHungPopover.ts'
import type { RefObject } from 'react'

interface Props {
  options: DebugOptions
  onChange: (change: Partial<DebugOptions>) => void
  locked: boolean
  onClosed: () => void
  // The button the popover hangs from.
  anchor?: RefObject<HTMLElement | null>
}

// The debug popover, mounted only while shown; `useHungPopover` places it and closes it.
export default function DebugMenu({ options, onChange, locked, onClosed, anchor }: Props) {
  const { settings } = useApp()
  const { dialogRef, dialogProps } = useHungPopover(onClosed, anchor)
  const closeCallsAvailable = settings.wheel.spinSeconds >= closeCallMinSpinSeconds
  return (
    <dialog ref={dialogRef} className="card wheel-drawer debug-drawer" aria-label="Debug options" {...dialogProps}>
      <div className="drawer-body">
        <div className="setup wheel-editor">
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
      </div>
    </dialog>
  )
}
