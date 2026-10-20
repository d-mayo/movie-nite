import { useEffect, useRef, type RefCallback } from 'react'
import { useApp } from '../state/store.ts'
import { cards, type CardType } from '../wildcards/cards.ts'

// The cards the overlay lists: the registry's, the FFF ones only once they are unlocked.
export function listedCards(fffUnlocked: boolean) {
  return cards.filter((card) => fffUnlocked || !card.fff)
}

const groups: { id: string; type: CardType; fff: boolean; heading: string }[] = [
  { id: 'wheel', type: 'wheel', fff: false, heading: 'Wheel cards' },
  { id: 'movie', type: 'movie', fff: false, heading: 'Movie cards' },
  { id: 'fff', type: 'movie', fff: true, heading: 'FFF cards' },
]

// Mounted only while shown, like Credits: Done unmounts it directly and Escape does so
// through the native `close` event. A press outside its box closes it too.
export default function CardSwitches({ onClosed }: { onClosed: () => void }) {
  const { settings, setCardEnabled, setCardsEnabled } = useApp()
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
        {groups.filter((g) => !g.fff || settings.fffUnlocked).map(({ id, type, fff, heading }) => {
          const group = cards.filter((card) => card.type === type && card.fff === fff)
          const on = group.filter((card) => !disabledCards.includes(card.id)).length
          // Neither all on nor all off: the group switch shows the dash.
          const mixed: RefCallback<HTMLInputElement> = (el) => {
            if (el) el.indeterminate = on > 0 && on < group.length
          }
          return (
          <section key={id} className="card-group" aria-labelledby={`card-group-${id}`}>
            <div className="card-head">
              <h3 id={`card-group-${id}`}>{heading}</h3>
              <label className="switch">
                <input
                  ref={mixed}
                  type="checkbox"
                  role="switch"
                  aria-label={fff ? `All ${heading}` : `All ${heading.toLowerCase()}`}
                  checked={on === group.length}
                  onChange={(e) =>
                    setCardsEnabled(
                      group.map((card) => card.id),
                      e.target.checked,
                    )
                  }
                />
                {on} of {group.length} on
              </label>
            </div>
            <ul>
              {group.map((card) => (
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
          )
        })}
      </div>
    </dialog>
  )
}
