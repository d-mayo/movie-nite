import letterboxdLogo from '../assets/letterboxd-logo.png'
import { letterboxdFilmUrl } from '../letterboxd/links.ts'
import { useLayoutEffect, useState, type CSSProperties } from 'react'
import type { GameEntry, Nomination, Outcome } from '../state/model.ts'
import { posterUrl, type TmdbClient } from '../tmdb/client.ts'
import { prefersReducedMotion } from '../wheel/reducedMotion.ts'
import { finishWindow, formatRuntime, synopsisSnippet } from '../wheel/reveal.ts'
import type { Wedge } from '../wheel/wedges.ts'
import FilmSearch from './FilmSearch.tsx'

const snippetChars = 140

// A wildcard's grey would vanish on the black stock, so its dot is the steel light.
export const wildcardDot = 'var(--film-steel-light)'

function Eyebrow({ color, closeCall, children }: { color: string; closeCall: boolean; children: string }) {
  return (
    <p className="reveal-eyebrow">
      <span className="reveal-dot" style={{ '--dot': color } as CSSProperties} />
      {children}
      {closeCall && <span className="reveal-tag">Close call</span>}
    </p>
  )
}

// A film that came through a movie card: it has no wedge of its own.
export interface CardFilm {
  nomination: Nomination
  // The card's name, or the viewer and the card.
  byline: string
  // The viewer's color for their own film, else the wildcard's steel light.
  dot: string
  // The film was a viewer's own, so it wins as a main-wheel win does.
  fromWheel: boolean
}

interface Props {
  // The wedge that landed; a film from a movie card is given as `film` instead.
  wedge?: Wedge
  film?: CardFilm
  revealedAt: Date
  client: TmdbClient
  // The film already saved for next week this night, which a second save replaces.
  heldFilm?: Nomination | null
  // The spin was a close call: the frame carries a tag.
  closeCall?: boolean
  // The spin was a blind one: the poster and title come into focus from a blur.
  blind?: boolean
  onOutcome: (nomination: Nomination, outcome: Outcome, fromWheel: boolean) => void
  onClose: () => void
}

interface Pick {
  nomination: Nomination
  at: Date
}

// The frame sits over the wheel, so it centers on the wheel's stage rather than the
// viewport, which the viewer pane skews. Null (centered in the viewport) until measured.
export function useStageCenter(): number | null {
  const [x, setX] = useState<number | null>(null)
  useLayoutEffect(() => {
    const measure = () => {
      const rect = document.querySelector('.wheel-stage')?.getBoundingClientRect()
      setX(rect && rect.width > 0 ? rect.left + rect.width / 2 : null)
    }
    measure()
    window.addEventListener('resize', measure)
    // Hiding the viewers pane moves the stage without resizing the window: watch the stage
    // and its parent, and re-measure when the pane's slide transition ends.
    const stage = document.querySelector('.wheel-stage')
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    if (stage) observer?.observe(stage)
    if (stage?.parentElement) observer?.observe(stage.parentElement)
    document.addEventListener('transitionend', measure)
    return () => {
      window.removeEventListener('resize', measure)
      observer?.disconnect()
      document.removeEventListener('transitionend', measure)
    }
  }, [])
  return x
}

// The game Play Rento names: a pawn where the poster would be, linking to the game, in the film reveal's frame.
// Play lands the card and saves the game; the × leaves with nothing.
export function GameReveal({
  game,
  byline,
  onPlay,
  onClose,
}: {
  game: GameEntry
  byline: string
  onPlay: () => void
  onClose: () => void
}) {
  const reduced = prefersReducedMotion()
  const centerX = useStageCenter()
  return (
    <div
      role="dialog"
      aria-labelledby="reveal-heading"
      className={reduced ? 'reveal' : 'reveal reveal-thread'}
      style={centerX === null ? undefined : { left: centerX }}
    >
      <div className="reveal-film">
        <button type="button" className="reveal-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
        <div className="reveal-poster">
          <a
            className="reveal-poster-link reveal-game-link"
            href={game.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${game.name}`}
          >
            <svg className="reveal-pawn" viewBox="-6 -6 12 12" aria-hidden="true">
              <circle cx="0" cy="-2.6" r="1.8" />
              <path d="M-1.2 -0.8 H1.2 C1.4 1 2.2 2.2 3 3 H-3 C-2.2 2.2 -1.4 1 -1.2 -0.8 Z" />
              <rect x="-3.6" y="3.4" width="7.2" height="1.4" rx="0.4" />
            </svg>
          </a>
        </div>
        <div className="reveal-info">
          <Eyebrow color={wildcardDot} closeCall={false}>
            Now playing
          </Eyebrow>
          <h2 id="reveal-heading">{game.name}</h2>
          <p className="reveal-byline">{byline}</p>
          <div className="reveal-actions">
            <button type="button" className="primary reveal-watch" onClick={onPlay}>
              Play
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Reveal({
  wedge,
  film,
  revealedAt,
  client,
  heldFilm = null,
  closeCall = false,
  blind = false,
  onOutcome,
  onClose,
}: Props) {
  const reduced = prefersReducedMotion()
  const centerX = useStageCenter()
  // The film a wildcard search landed on, with the moment of the pick.
  const [picked, setPicked] = useState<Pick | null>(null)

  // A nomination reveal is a viewer's film; a wildcard reveal shows the picked film once there is one.
  const shown: Pick | null = film
    ? { nomination: film.nomination, at: revealedAt }
    : wedge?.nomination
      ? { nomination: wedge.nomination, at: revealedAt }
      : picked
  const fromWheel = film ? film.fromWheel : wedge?.nomination != null

  const dot = film ? film.dot : wedge && fromWheel ? wedge.color : wildcardDot
  const byline = film ? film.byline : fromWheel ? `Nominated by ${wedge?.viewerName}` : 'Wildcard pick'

  return (
    <div
      role="dialog"
      aria-labelledby="reveal-heading"
      className={reduced ? 'reveal' : 'reveal reveal-thread'}
      style={centerX === null ? undefined : { left: centerX }}
    >
      <div className={blind && fromWheel && !film && !reduced ? 'reveal-film reveal-blind' : 'reveal-film'}>
        {shown ? (
          <FilmReveal
            nomination={shown.nomination}
            at={shown.at}
            dot={dot}
            byline={byline}
            heldFilm={heldFilm}
            closeCall={closeCall}
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
              <Eyebrow color={dot} closeCall={closeCall}>
                Wildcard
              </Eyebrow>
              <h2 id="reveal-heading">Wildcard!</h2>
              <FilmSearch
                label="Search for a wildcard film"
                client={client}
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

// The snippet keeps the card compact; when it cuts the text, hovering or focusing it
// pops out the full description.
function Synopsis({ overview }: { overview: string }) {
  const snippet = synopsisSnippet(overview, snippetChars)
  const full = overview.trim()
  if (snippet === full) return <p className="reveal-synopsis">{snippet}</p>
  return (
    <div className="reveal-synopsis reveal-synopsis-cut" tabIndex={0}>
      <p>{snippet}</p>
      <p className="reveal-synopsis-full" role="tooltip">
        {full}
      </p>
    </div>
  )
}

interface FilmRevealProps {
  nomination: Nomination
  at: Date
  dot: string
  byline: string
  heldFilm: Nomination | null
  closeCall: boolean
  onOutcome: (outcome: Outcome) => void
  onClose: () => void
}

function FilmReveal({ nomination, at, dot, byline, heldFilm, closeCall, onOutcome, onClose }: FilmRevealProps) {
  const [confirming, setConfirming] = useState(false)
  const window = finishWindow(at, nomination.runtime)
  return (
    <>
      <button type="button" className="reveal-close" aria-label="Close" onClick={onClose}>
        ×
      </button>
      <div className="reveal-poster">
        <a
          className="reveal-poster-link"
          href={letterboxdFilmUrl(nomination.tmdbId)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${nomination.title} on Letterboxd`}
        >
          {nomination.posterPath ? (
            <img
              src={posterUrl(nomination.posterPath, 'w185')}
              alt={`Poster of ${nomination.title}`}
              width="185"
            />
          ) : (
            <span role="img" aria-label="No poster" className="poster-placeholder" />
          )}
          <span className="reveal-poster-go" aria-hidden="true">
            <span>Go to</span>
            <img src={letterboxdLogo} alt="" />
          </span>
        </a>
      </div>
      <div className="reveal-info">
        <Eyebrow color={dot} closeCall={closeCall}>
          Now showing
        </Eyebrow>
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
        {nomination.overview && <Synopsis overview={nomination.overview} />}
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
