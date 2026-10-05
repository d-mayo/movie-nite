import confetti from 'canvas-confetti'
import { motion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { posterUrl } from '../tmdb/client.ts'
import { prefersReducedMotion } from '../wheel/reducedMotion.ts'
import { finishWindow, formatRuntime, synopsisSnippet } from '../wheel/reveal.ts'
import type { Wedge } from '../wheel/wedges.ts'

const snippetChars = 200

interface Props {
  wedge: Wedge
  revealedAt: Date
  onClose: () => void
}

export default function Reveal({ wedge, revealedAt, onClose }: Props) {
  const reduced = prefersReducedMotion()
  const fired = useRef(false)
  const { nomination } = wedge

  useEffect(() => {
    if (fired.current || reduced) return
    fired.current = true
    confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } })
  }, [reduced])

  const window = nomination ? finishWindow(revealedAt, nomination.runtime) : null

  return (
    <motion.div
      role="dialog"
      aria-labelledby="reveal-heading"
      className="reveal"
      initial={reduced ? false : { opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
    >
      {nomination ? (
        <>
          <h2 id="reveal-heading">{nomination.title}</h2>
          <p>Nominated by {wedge.viewerName}</p>
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
          {nomination.overview && (
            <p>{synopsisSnippet(nomination.overview, snippetChars)}</p>
          )}
          {nomination.runtime !== null && <p>{formatRuntime(nomination.runtime)}</p>}
          <p>
            {window
              ? `Ends around ${window.start}–${window.end}`
              : 'End time unknown (no runtime on TMDB)'}
          </p>
        </>
      ) : (
        <h2 id="reveal-heading">Wildcard!</h2>
      )}
      <button type="button" onClick={onClose}>
        Close
      </button>
    </motion.div>
  )
}
