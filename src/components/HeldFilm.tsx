import { useEffect, useRef } from 'react'
import { formatRuntime } from '../wheel/reveal.ts'
import { useApp } from '../state/store.ts'
import { Poster } from './FilmSearch.tsx'
import { filmLabel } from './NightOver.tsx'

// Where focus goes once the control just pressed has unmounted: set by a press
// and consumed once, so a card or chip that appears any other way takes none.
export type FocusRequest = 'chip' | 'dismiss' | null

interface Props {
  focusRequest: FocusRequest
  onRequestFocus: (request: FocusRequest) => void
}

// The film held from an earlier night, as a non-modal corner card.
export function HeldFilmCard({ focusRequest, onRequestFocus }: Props) {
  const { holdover, night, clearHoldover, setHoldoverDismissed } = useApp()
  const dismiss = useRef<HTMLButtonElement>(null)
  const shown = holdover !== null && !night.holdoverDismissed
  useEffect(() => {
    if (shown && focusRequest === 'dismiss') {
      dismiss.current?.focus()
      onRequestFocus(null)
    }
  }, [shown, focusRequest, onRequestFocus])
  if (!holdover || !shown) return null
  return (
    <aside className="card held-film" aria-labelledby="held-film-heading">
      <h2 id="held-film-heading">Watch next session</h2>
      <div className="held-film-body">
        <Poster path={holdover.posterPath} title={holdover.title} />
        <div>
          <p className="held-film-title">{filmLabel(holdover)}</p>
          {holdover.runtime !== null && <p>{formatRuntime(holdover.runtime)}</p>}
        </div>
      </div>
      <div className="held-film-actions">
        <button
          type="button"
          ref={dismiss}
          className="quiet"
          onClick={() => {
            onRequestFocus('chip')
            setHoldoverDismissed(true)
          }}
        >
          Dismiss
        </button>
        <button type="button" className="quiet" onClick={clearHoldover}>
          Clear
        </button>
      </div>
    </aside>
  )
}

// The dismissed card, shrunk to a banner button that brings it back.
export function HeldFilmChip({ focusRequest, onRequestFocus }: Props) {
  const { holdover, night, setHoldoverDismissed } = useApp()
  const chip = useRef<HTMLButtonElement>(null)
  const shown = holdover !== null && night.holdoverDismissed
  useEffect(() => {
    if (shown && focusRequest === 'chip') {
      chip.current?.focus()
      onRequestFocus(null)
    }
  }, [shown, focusRequest, onRequestFocus])
  if (!holdover || !shown) return null
  return (
    <button
      type="button"
      ref={chip}
      className="quiet held-film-chip"
      onClick={() => {
        onRequestFocus('dismiss')
        setHoldoverDismissed(false)
      }}
    >
      Next: {holdover.title}
    </button>
  )
}
