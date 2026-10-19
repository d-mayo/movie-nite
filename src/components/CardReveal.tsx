import { useEffect, useRef } from 'react'
import { prefersReducedMotion } from '../wheel/reducedMotion.ts'
import type { DealtCard } from '../wildcards/deal.ts'
import { useStageCenter } from './Reveal.tsx'

interface Props {
  card: DealtCard
  // The spin was a close call: the card carries a tag.
  closeCall?: boolean
  onBack: () => void
}

const typeLines = { wheel: 'Wheel card', movie: 'Movie card' } as const

// A landed wildcard card, turned over from its back to its face (face up at once with
// reduced motion). Back to the main wheel, or Escape, takes its effect.
export default function CardReveal({ card, closeCall = false, onBack }: Props) {
  const flip = !prefersReducedMotion()
  const centerX = useStageCenter()
  const back = useRef<HTMLButtonElement>(null)
  const onBackRef = useRef(onBack)
  useEffect(() => {
    onBackRef.current = onBack
  })

  useEffect(() => {
    back.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      // Escape that closes the Wheel settings popover (a <dialog>) is not for the card.
      if (event.key === 'Escape' && !(event.target as Element | null)?.closest?.('dialog')) onBackRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div
      role="dialog"
      aria-labelledby="card-heading"
      className="card-reveal"
      style={centerX === null ? undefined : { left: centerX }}
    >
      <div className={flip ? 'card-turn card-flip' : 'card-turn'} data-testid="card-turn">
        <div className="card-face">
          <p className="card-type">
            {typeLines[card.type]}
            {closeCall && <span className="reveal-tag">Close call</span>}
          </p>
          <h2 id="card-heading">{card.title}</h2>
          <p className="card-text">{card.text}</p>
          <button ref={back} type="button" className="card-back-button" onClick={onBack}>
            Back to the main wheel
          </button>
        </div>
        {flip && <div className="card-back" aria-hidden="true" />}
      </div>
    </div>
  )
}
