import { useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { viewersOnWheel } from '../state/model.ts'
import { useApp } from '../state/store.ts'
import {
  defaultWheelSettings,
  maxSoundVolume,
  maxSpinSeconds,
  maxSpinTurnsPerSecond,
  minSoundVolume,
  minSpinSeconds,
  minSpinTurnsPerSecond,
} from '../wheel/edit.ts'
import CardSwitches, { listedCards } from './CardSwitches.tsx'
import Slider from './Slider.tsx'
import Stepper from './Stepper.tsx'
import { useHungPopover } from './useHungPopover.ts'

interface Props {
  locked?: boolean
  onClosed: () => void
  // The button the popover hangs from.
  anchor?: RefObject<HTMLElement | null>
}

// Mounted only while shown, like the End night dialog: Cancel and confirming
// unmount it directly, and Escape does so through the native `close` event.
function RestoreDialog({ onConfirm, onClosed }: { onConfirm: () => void; onClosed: () => void }) {
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
    <dialog ref={ref} className="card confirm" aria-labelledby="restore-heading">
      <h2 id="restore-heading">Restore all wheel settings?</h2>
      <p>Every wildcard, card switch, spin, default and sound setting goes back to its factory value. Adjustments made for a viewer stay.</p>
      <div className="confirm-actions">
        <button
          type="button"
          className="danger"
          onClick={() => {
            onConfirm()
            dismiss()
          }}
        >
          Restore
        </button>
        <button type="button" className="quiet" onClick={dismiss}>
          Cancel
        </button>
      </div>
    </dialog>
  )
}

// The Wheel settings popover, mounted only while shown; `useHungPopover`
// places it and closes it.
export default function WheelEditor({ locked = false, onClosed, anchor }: Props) {
  const {
    night,
    settings,
    setWildcardsPerViewer,
    setWildcardCount,
    setWildcardWeight,
    setDefaultSlices,
    setDefaultWeight,
    setSpinSeconds,
    setSpinTurnsPerSecond,
    setSoundMusic,
    setSoundEffects,
    setSoundVolume,
    setSoundMuted,
    setShowLabels,
    setWildcardWheel,
    restoreWheelSettings,
  } = useApp()
  const { wheel } = settings
  const { dialogRef, dialogProps, suspend, resume } = useHungPopover(onClosed, anchor)
  const [confirming, setConfirming] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const chooseButton = useRef<HTMLButtonElement>(null)
  function showConfirm() {
    suspend()
    setConfirming(true)
  }
  const closeConfirm = useCallback(() => {
    setConfirming(false)
    resume()
    dialogRef.current?.focus()
  }, [resume, dialogRef])
  function showCards() {
    suspend()
    setChoosing(true)
  }
  // Back to the popover and the button that opened the overlay.
  const closeCards = useCallback(() => {
    setChoosing(false)
    resume()
    chooseButton.current?.focus()
  }, [resume])
  const atFactory = (Object.keys(defaultWheelSettings) as (keyof typeof wheel)[]).every((k) => {
    const now = wheel[k]
    const factory = defaultWheelSettings[k]
    if (Array.isArray(now) && Array.isArray(factory)) {
      return now.length === factory.length && now.every((v, i) => v === factory[i])
    }
    return now === factory
  })
  // Counted over the listed cards, so an unknown id in the saved list lowers nothing.
  const listed = listedCards(!!settings.fffUnlocked)
  const cardsOn = listed.filter((card) => !wheel.disabledCards.includes(card.id)).length
  const onWheel = viewersOnWheel(night)
  return (
    <>
      <dialog
        ref={dialogRef}
        className="card wheel-drawer"
        aria-label="Wheel settings"
        {...dialogProps}
      >
        <div className="drawer-body">
          <fieldset className="setup wheel-editor">
            <fieldset className="inset-card" disabled={locked} aria-labelledby="wildcards-heading">
              <div className="card-head">
                <h3 id="wildcards-heading">Wildcards</h3>
                <label className="switch">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={wheel.wildcardsPerViewer}
                    onChange={(e) => setWildcardsPerViewer(e.target.checked)}
                  />
                  One per viewer
                </label>
              </div>
              {onWheel.length === 0 && <p>Nobody is on the wheel.</p>}
              <Stepper
                label="Wildcard count"
                value={wheel.wildcardsPerViewer ? onWheel.length : wheel.wildcardCount}
                min={0}
                max={12}
                disabled={locked || wheel.wildcardsPerViewer}
                onChange={setWildcardCount}
              />
              <Slider
                label="Wildcard weight"
                value={wheel.wildcardWeight}
                step={0.5}
                min={0.5}
                max={20}
                onChange={setWildcardWeight}
              />
            </fieldset>
            <fieldset className="inset-card" disabled={locked} aria-labelledby="cards-heading">
              <div className="card-head">
                <h3 id="cards-heading">Wildcard Cards</h3>
                <label className="switch">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={wheel.wildcardWheel}
                    onChange={(e) => setWildcardWheel(e.target.checked)}
                  />
                  Wildcard wheel
                </label>
              </div>
              <div className="cards-choose">
                <button
                  ref={chooseButton}
                  type="button"
                  className="quiet"
                  disabled={locked || !wheel.wildcardWheel}
                  onClick={showCards}
                >
                  Choose cards
                </button>
                <span>
                  {cardsOn} of {listed.length} on
                </span>
              </div>
            </fieldset>
            <fieldset className="inset-card" disabled={locked} aria-labelledby="spin-heading">
              <div className="card-head">
                <h3 id="spin-heading">Spin</h3>
              </div>
              <Slider
                label="Length"
                value={wheel.spinSeconds}
                step={0.5}
                min={minSpinSeconds}
                max={maxSpinSeconds}
                format={(n) => `${n} s`}
                onChange={setSpinSeconds}
              />
              <Slider
                label="Intensity"
                value={wheel.spinTurnsPerSecond}
                step={0.1}
                min={minSpinTurnsPerSecond}
                max={maxSpinTurnsPerSecond}
                format={(n) => `${n} turns/s`}
                onChange={setSpinTurnsPerSecond}
              />
            </fieldset>
            <fieldset className="inset-card" disabled={locked} aria-labelledby="defaults-heading">
              <div className="card-head">
                <h3 id="defaults-heading">Viewer Defaults</h3>
                <label className="switch">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={wheel.showLabels}
                    onChange={(e) => setShowLabels(e.target.checked)}
                  />
                  Show labels
                </label>
              </div>
              <Stepper
                label="Slices per viewer"
                value={wheel.defaultSlices}
                min={1}
                max={12}
                disabled={locked}
                onChange={setDefaultSlices}
              />
              <Slider
                label="Weight per viewer"
                value={wheel.defaultWeight}
                step={0.5}
                min={0.5}
                max={20}
                onChange={setDefaultWeight}
              />
            </fieldset>
            <section className="inset-card" aria-labelledby="sound-heading">
              <div className="card-head">
                <h3 id="sound-heading">Sound</h3>
                <button
                  type="button"
                  className="mute-button"
                  aria-pressed={wheel.soundMuted}
                  aria-label="Mute"
                  title={wheel.soundMuted ? 'Unmute' : 'Mute'}
                  onClick={() => setSoundMuted(!wheel.soundMuted)}
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                    <path d="M3 9v6h4l5 4V5L7 9z" fill="currentColor" />
                    {wheel.soundMuted ? (
                      <path
                        d="M16 9l5 6M21 9l-5 6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    ) : (
                      <path
                        d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    )}
                  </svg>
                </button>
              </div>
              <Slider
                label="Volume"
                value={wheel.soundVolume}
                step={5}
                min={minSoundVolume}
                max={maxSoundVolume}
                format={(n) => `${n}%`}
                disabled={wheel.soundMuted}
                onChange={setSoundVolume}
              />
              {/* Music and Effects are levels under the Volume: their tracks end at its thumb. */}
              <div
                className="sound-subs"
                role="group"
                aria-label="Levels under the volume"
                style={{ '--volume': `${wheel.soundVolume}%` } as CSSProperties}
              >
                <Slider
                  label="Music"
                  value={Math.min(wheel.soundMusic, wheel.soundVolume)}
                  step={5}
                  min={minSoundVolume}
                  max={wheel.soundVolume}
                  format={(n) => `${n}%`}
                  disabled={wheel.soundMuted}
                  onChange={setSoundMusic}
                />
                <Slider
                  label="Effects"
                  value={Math.min(wheel.soundEffects, wheel.soundVolume)}
                  step={5}
                  min={minSoundVolume}
                  max={wheel.soundVolume}
                  format={(n) => `${n}%`}
                  disabled={wheel.soundMuted}
                  onChange={setSoundEffects}
                />
              </div>
            </section>
            <button
              type="button"
              className="quiet restore-all"
              disabled={locked || atFactory}
              onClick={showConfirm}
            >
              Restore All Defaults
            </button>
          </fieldset>
        </div>
      </dialog>
      {confirming && <RestoreDialog onConfirm={restoreWheelSettings} onClosed={closeConfirm} />}
      {choosing && <CardSwitches onClosed={closeCards} />}
    </>
  )
}
