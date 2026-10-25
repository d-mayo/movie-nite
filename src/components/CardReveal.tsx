import { useEffect, useRef, useState, type ReactNode } from 'react'
import { prefersReducedMotion } from '../wheel/reducedMotion.ts'
import type { DealtCard } from '../wildcards/deal.ts'
import { useStageCenter } from './Reveal.tsx'

interface Props {
  card: DealtCard
  // The spin was a close call: the card carries a tag.
  closeCall?: boolean
  // The card's text when it is not the rolled one (a Reshuffle's draw, its swap or its failure).
  text?: string
  // The card's text worded from what it does to the wheel now, as ordinary text (not a live region); `text` wins.
  worded?: string
  // Added to the type line, for a card on a sub-board: "Spin 2 of 3".
  typeSuffix?: string
  // The button's words when they are not "Back to the main wheel".
  backLabel?: string
  // Back and Escape wait: a draw is under way, or the cans are in play.
  busy?: boolean
  // What sits under the text: a movie card's sealed cans.
  children?: ReactNode
  // The card is wide, to hold three large cans.
  wide?: boolean
  onBack: () => void
}

const typeLines = { wheel: 'Wheel card', movie: 'Movie card' } as const

// A landed wildcard card, turned over from its back to its face (face up at once with
// reduced motion). Back to the main wheel, or Escape, takes its effect.
export default function CardReveal({ card, closeCall = false, text, worded, typeSuffix, backLabel, busy = false, children, wide = false, onBack }: Props) {
  const [flip, setFlip] = useState(() => !prefersReducedMotion())
  const centerX = useStageCenter()
  const back = useRef<HTMLButtonElement>(null)
  const onBackRef = useRef(onBack)
  const busyRef = useRef(busy)
  useEffect(() => {
    onBackRef.current = onBack
    busyRef.current = busy
  })

  // Back takes focus once a draw that held it is done.
  useEffect(() => {
    if (!busy) back.current?.focus()
  }, [busy])

  useEffect(() => {
    back.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      // Escape that closes the Wheel settings popover (a <dialog>) is not for the card.
      if (event.key !== 'Escape' || (event.target as Element | null)?.closest?.('dialog')) return
      // Nor is the Escape that closes the ⚙ menu, a popover.
      let popover = false
      try {
        popover = document.querySelector(':popover-open') !== null
      } catch {
        // No popover support: nothing is open.
      }
      if (!popover && !busyRef.current) onBackRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div
      role="dialog"
      aria-labelledby="card-heading"
      className={`card-reveal${wide ? ' card-reveal-wide' : ''}${flip ? ' card-reveal-flipping' : ''}`}
      style={centerX === null ? undefined : { left: centerX }}
    >
      <div
        className={flip ? 'card-turn card-flip' : 'card-turn'}
        data-testid="card-turn"
        onAnimationEnd={(e) => e.target === e.currentTarget && setFlip(false)}
      >
        <div className={`card-face card-face-${card.type}`}>
          <p className="card-type">
            {typeLines[card.type]}
            {typeSuffix && ` · ${typeSuffix}`}
            {closeCall && <span className="reveal-tag">Close call</span>}
          </p>
          <h2 id="card-heading">{card.title}</h2>
          {text === undefined ? (
            <p className="card-text">{worded ?? card.text}</p>
          ) : (
            <p className="card-text" role="status">
              {text}
            </p>
          )}
          {children}
          <button ref={back} type="button" className="card-back-button" disabled={busy} onClick={onBack}>
            {backLabel ?? 'Back to the main wheel'}
          </button>
        </div>
        {flip && <div className="card-back" aria-hidden="true" />}
      </div>
    </div>
  )
}
