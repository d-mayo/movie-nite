import { useEffect, useRef } from 'react'
import { chipEffects } from '../wildcards/tonight.ts'
import { useApp } from '../state/store.ts'

export const cardChipsHeightProperty = '--card-chips-height'

// Tonight's landed cards as a row of chips under the main wheel, one per card in
// the order they landed. Gone once the night has ended (the Night over summary
// lists the cards then) and when no card is left to show.
export function CardChips() {
  const { night, roster } = useApp()
  const list = useRef<HTMLUListElement>(null)
  const shown = night.ended
    ? []
    : chipEffects(
        night.cardEffects,
        roster.map((v) => v.id),
      )
  const any = shown.length > 0
  // The list's height goes to the root, for the wide layout's stage cap.
  useEffect(() => {
    const root = document.documentElement
    const el = list.current
    if (!any || !el || typeof ResizeObserver === 'undefined') return
    const publish = () => root.style.setProperty(cardChipsHeightProperty, `${el.offsetHeight}px`)
    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(el)
    return () => {
      observer.disconnect()
      root.style.removeProperty(cardChipsHeightProperty)
    }
  }, [any])
  if (!any) return null
  return (
    <ul ref={list} className="card-chips" aria-label="Tonight's cards">
      {shown.map((effect, i) => (
        <li key={i} className="card-chip">
          {effect.label}
        </li>
      ))}
    </ul>
  )
}
