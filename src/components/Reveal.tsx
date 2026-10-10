import { useState, type CSSProperties } from 'react'
import type { Nomination, Outcome } from '../state/model.ts'
import { posterUrl, type TmdbClient } from '../tmdb/client.ts'
import { prefersReducedMotion } from '../wheel/reducedMotion.ts'
import { finishWindow, formatRuntime, synopsisSnippet } from '../wheel/reveal.ts'
import type { Wedge } from '../wheel/wedges.ts'
import FilmSearch from './FilmSearch.tsx'

const snippetChars = 200

// A wildcard's grey would vanish on the black stock, so its dot is the steel light.
const wildcardDot = 'var(--film-steel-light)'

function Eyebrow({ color, children }: { color: string; children: string }) {
  return (
    <p className="reveal-eyebrow">
      <span className="reveal-dot" style={{ '--dot': color } as CSSProperties} />
      {children}
    </p>
  )
}

interface Props {
  wedge: Wedge
  revealedAt: Date
  client: TmdbClient
  // The film already saved for next week this night, which a second save replaces.
  heldFilm?: Nomination | null
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
  heldFilm = null,
  onAuthError,
  onOutcome,
  onClose,
}: Props) {
  const reduced = prefersReducedMotion()
  // The film a wildcard search landed on, with the moment of the pick.
  const [picked, setPicked] = useState<Pick | null>(null)

  // A nomination reveal is a viewer's film; a wildcard reveal shows the picked film once there is one.
  const shown: Pick | null = wedge.nomination
    ? { nomination: wedge.nomination, at: revealedAt }
    : picked
  const fromWheel = wedge.nomination !== null

  const dot = fromWheel ? wedge.color : wildcardDot

  return (
    <div
      role="dialog"
      aria-labelledby="reveal-heading"
      className={reduced ? 'reveal' : 'reveal reveal-thread'}
    >
      <div className="reveal-film">
        {shown ? (
          <FilmReveal
            nomination={shown.nomination}
            at={shown.at}
            dot={dot}
            byline={fromWheel ? `Nominated by ${wedge.viewerName}` : 'Wildcard pick'}
            heldFilm={heldFilm}
            onOutcome={(outcome) => onOutcome(shown.nomination, outcome, fromWheel)}
            onClose={onClose}
          />
        ) : (
          <>
            <div className="reveal-poster">
              <span className="poster-placeholder reveal-unknown" aria-hidden="true">
                ?
              </span>
            </div>
            <div className="reveal-info">
              <Eyebrow color={dot}>Wildcard</Eyebrow>
              <h2 id="reveal-heading">Wildcard!</h2>
              <FilmSearch
                label="Search for a wildcard film"
                client={client}
                onAuthError={onAuthError}
                onPick={(nomination) => setPicked({ nomination, at: new Date() })}
              />
              <button type="button" className="reveal-back" onClick={onClose}>
                Back to the wheel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

interface FilmRevealProps {
  nomination: Nomination
  at: Date
  dot: string
  byline: string
  heldFilm: Nomination | null
  onOutcome: (outcome: Outcome) => void
  onClose: () => void
}

function FilmReveal({ nomination, at, dot, byline, heldFilm, onOutcome, onClose }: FilmRevealProps) {
  const [confirming, setConfirming] = useState(false)
  const window = finishWindow(at, nomination.runtime)
  return (
    <>
      <button type="button" className="reveal-close" aria-label="Close" onClick={onClose}>
        ×
      </button>
      <div className="reveal-poster">
        {nomination.posterPath ? (
          <img
            src={posterUrl(nomination.posterPath, 'w185')}
            alt={`Poster of ${nomination.title}`}
            width="185"
          />
        ) : (
          <span role="img" aria-label="No poster" className="poster-placeholder" />
        )}
      </div>
      <div className="reveal-info">
        <Eyebrow color={dot}>Now showing</Eyebrow>
        <h2 id="reveal-heading">{nomination.title}</h2>
        {nomination.year !== null && <p className="reveal-year">{nomination.year}</p>}
        <p className="reveal-byline">{byline}</p>
        <p className="reveal-meta">
          {nomination.runtime !== null && <span>{formatRuntime(nomination.runtime)}</span>}
          <span>
            {window
              ? `Ends around ${window.start}–${window.end}`
              : 'End time unknown (no runtime on TMDB)'}
          </span>
        </p>
        {nomination.overview && (
          <p className="reveal-synopsis">{synopsisSnippet(nomination.overview, snippetChars)}</p>
        )}
        <div className="reveal-actions">
          <button type="button" className="primary reveal-watch" onClick={() => onOutcome('watch')}>
            Watch
          </button>
          {confirming && heldFilm ? (
            <div role="alert" className="reveal-replace">
              <p>
                This will replace {heldFilm.title}, already saved for next week.
              </p>
              <div className="reveal-replace-actions">
                <button type="button" className="danger" onClick={() => onOutcome('tooLong')}>
                  Replace it
                </button>
                <button type="button" className="quiet" onClick={() => setConfirming(false)}>
                  Keep it
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="quiet reveal-save"
              onClick={() => (heldFilm ? setConfirming(true) : onOutcome('tooLong'))}
            >
              Save for Next Week
            </button>
          )}
        </div>
      </div>
    </>
  )
}
