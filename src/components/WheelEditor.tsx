import { useEffect, useRef, type RefObject } from 'react'
import { viewersOnWheel } from '../state/model.ts'
import { useApp } from '../state/store.ts'
import Slider from './Slider.tsx'

interface Props {
  locked?: boolean
  onClosed: () => void
  // The button the popover hangs from.
  anchor?: RefObject<HTMLElement | null>
}

// The Wheel settings popover. Mounted only while shown, like the End night
// dialog: Done and a backdrop click unmount it directly, and Escape does so
// through the native `close` event.
export default function WheelEditor({ locked = false, onClosed, anchor }: Props) {
  const { night, settings, setWildcardWeight } = useApp()
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  // True when the press that began a click landed on the backdrop, not in the drawer.
  const pressedBackdrop = useRef(false)
  useEffect(() => {
    const el = dialog.current
    if (!el) return
    if (!el.open) el.showModal()
    el.addEventListener('close', onClosed)
    // Keep focus off the sliders, so an arrow key right after opening changes nothing.
    heading.current?.focus()
    // Hang the popover under the button that opened it, right edges aligned.
    function place() {
      const rect = anchor?.current?.getBoundingClientRect()
      if (!el || !rect) return
      el.style.top = `${rect.bottom + 8}px`
      const left = rect.right - el.offsetWidth
      el.style.left = `${Math.min(Math.max(8, left), window.innerWidth - el.offsetWidth - 8)}px`
      el.style.maxHeight = `${window.innerHeight - rect.bottom - 24}px`
    }
    place()
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('resize', place)
      el.removeEventListener('close', onClosed)
    }
  }, [anchor, onClosed])
  // Close natively, then unmount at once rather than wait for the `close` event.
  function dismiss() {
    dialog.current?.close()
    onClosed()
  }
  const onWheel = viewersOnWheel(night)
  return (
    <dialog
      ref={dialog}
      className="card wheel-drawer"
      aria-labelledby="wheel-settings-heading"
      onPointerDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressedBackdrop.current) dismiss()
      }}
    >
      <div className="drawer-body">
        <h2 id="wheel-settings-heading" tabIndex={-1} ref={heading}>
          Wheel settings
        </h2>
        <fieldset disabled={locked} className="setup wheel-editor">
          <h3>Wildcards</h3>
          {onWheel.length === 0 && <p>Nobody is on the wheel.</p>}
          <Slider
            label="Wildcard weight"
            value={settings.wheel.wildcardWeight}
            step={0.5}
            min={0.5}
            max={20}
            onChange={setWildcardWeight}
          />
        </fieldset>
        <div className="drawer-footer">
          <button type="button" className="primary" onClick={dismiss}>
            Done
          </button>
        </div>
      </div>
    </dialog>
  )
}
