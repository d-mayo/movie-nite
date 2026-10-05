import confetti from 'canvas-confetti'
import { motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import type { Nomination, Outcome } from '../state/model.ts'
import { posterUrl, type TmdbClient } from '../tmdb/client.ts'
import { prefersReducedMotion } from '../wheel/reducedMotion.ts'
import { finishWindow, formatRuntime, synopsisSnippet } from '../wheel/reveal.ts'
import type { Wedge } from '../wheel/wedges.ts'
import FilmSearch from './FilmSearch.tsx'

const snippetChars = 200

interface Props {
  wedge: Wedge
  revealedAt: Date
  client: TmdbClient
  onAuthError: () => void
  onOutcome: (nomination: Nomination, outcome: Outcome, fromWheel: boolean) => void
  onClose: () => void
}

interface Pick {
  nomination: Nomination
  at: Date
}

export default function Reveal({
  wedge,
  revealedAt,
  client,
  onAuthError,
  onOutcome,
  onClose,
}: Props) {
  const reduced = prefersReducedMotion()
  const fired = useRef<unknown>(null)
  // The film a wildcard search landed on, with the moment of the pick.
  const [picked, setPicked] = useState<Pick | null>(null)

  // A nomination reveal is a viewer's film; a wildcard reveal shows the picked film once there is one.
  const shown: Pick | null = wedge.nomination
    ? { nomination: wedge.nomination, at: revealedAt }
    : picked
  const fromWheel = wedge.nomination !== null

  const key = shown?.nomination ?? 'wildcard'
  useEffect(() => {
    if (fired.current === key || reduced) return
    fired.current = key
    confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } })
  }, [key, reduced])

  return (
    <motion.div
      role="dialog"
      aria-labelledby="reveal-heading"
      className="reveal"
      initial={reduced ? false : { opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
    >
      {shown ? (
        <FilmReveal
          nomination={shown.nomination}
          at={shown.at}
          byline={fromWheel ? `Nominated by ${wedge.viewerName}` : 'Wildcard pick'}
          onOutcome={(outcome) => onOutcome(shown.nomination, outcome, fromWheel)}
          onClose={onClose}
        />
      ) : (
        <>
          <h2 id="reveal-heading">Wildcard!</h2>
          <FilmSearch
            label="Search for a wildcard film"
            client={client}
            onAuthError={onAuthError}
            onPick={(nomination) => setPicked({ nomination, at: new Date() })}
          />
          <button type="button" onClick={onClose}>
            Back to the wheel
          </button>
        </>
      )}
    </motion.div>
  )
}

interface FilmRevealProps {
  nomination: Nomination
  at: Date
  byline: string
  onOutcome: (outcome: Outcome) => void
  onClose: () => void
}

function FilmReveal({ nomination, at, byline, onOutcome, onClose }: FilmRevealProps) {
  const window = finishWindow(at, nomination.runtime)
  return (
    <>
      <button type="button" className="reveal-close" aria-label="Close" onClick={onClose}>
        ×
      </button>
      <h2 id="reveal-heading">{nomination.title}</h2>
      <p>{byline}</p>
      {nomination.posterPath ? (
        <img
          src={posterUrl(nomination.posterPath, 'w185')}
          alt={`Poster of ${nomination.title}`}
          width="185"
        />
      ) : (
        <span role="img" aria-label="No poster" className="poster-placeholder" />
      )}
      {nomination.year !== null && <p>{nomination.year}</p>}
      {nomination.overview && <p>{synopsisSnippet(nomination.overview, snippetChars)}</p>}
      {nomination.runtime !== null && <p>{formatRuntime(nomination.runtime)}</p>}
      <p>
        {window
          ? `Ends around ${window.start}–${window.end}`
          : 'End time unknown (no runtime on TMDB)'}
      </p>
      <button type="button" onClick={() => onOutcome('watch')}>
        Watch
      </button>
      <button type="button" onClick={() => onOutcome('tooLong')}>
        Too long
      </button>
    </>
  )
}
