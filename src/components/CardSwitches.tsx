import { useEffect, useRef } from 'react'
import { useApp } from '../state/store.ts'
import { cards, type CardType } from '../wildcards/cards.ts'

// The cards the overlay lists: the registry's, but not the FFF ones.
export const listedCards = cards.filter((card) => !card.fff)

const groups: { type: CardType; heading: string }[] = [
  { type: 'wheel', heading: 'Wheel cards' },
  { type: 'movie', heading: 'Movie cards' },
]

// Mounted only while shown, like Credits: Done unmounts it directly and Escape does so
// through the native `close` event. A press outside its box closes it too.
export default function CardSwitches({ onClosed }: { onClosed: () => void }) {
  const { settings, setCardEnabled } = useApp()
  const { disabledCards } = settings.wheel
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
  return (
    <dialog
      ref={ref}
      className="card card-switches"
      aria-labelledby="card-switches-heading"
      onPointerDown={(e) => {
        outsidePress.current = e.target === e.currentTarget && !inside(e.clientX, e.clientY)
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && outsidePress.current) dismiss()
        outsidePress.current = false
      }}
    >
      <div className="card-switches-head">
        <h2 id="card-switches-heading">Choose cards</h2>
        <button type="button" className="quiet" onClick={dismiss}>
          Done
        </button>
      </div>
      <div className="card-switches-body">
        {groups.map(({ type, heading }) => (
          <section key={type} aria-labelledby={`card-group-${type}`}>
            <h3 id={`card-group-${type}`}>{heading}</h3>
            <ul>
              {listedCards
                .filter((card) => card.type === type)
                .map((card) => (
                  <li key={card.id}>
                    <label className="switch">
                      <input
                        type="checkbox"
                        role="switch"
                        checked={!disabledCards.includes(card.id)}
                        aria-describedby={`card-desc-${card.id}`}
                        onChange={(e) => setCardEnabled(card.id, e.target.checked)}
                      />
                      {card.name}
                    </label>
                    <p id={`card-desc-${card.id}`}>{card.description}</p>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </dialog>
  )
}
