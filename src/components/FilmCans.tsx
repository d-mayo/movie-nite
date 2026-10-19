import { useEffect, useId, useRef, useState } from 'react'
import { posterUrl } from '../tmdb/client.ts'
import { formatRuntime } from '../wheel/reveal.ts'
import { hasCans, phaseOf, tickDelayMs, tickPath, type Cans } from '../wildcards/cans.ts'

// How long each beat lasts, in milliseconds, before a test or reduced motion shrinks them.
const arrowSettleMs = 450
const drumrollMs = 2400
const sealedHoldMs = 1100
// With two cans: a pause on the picked film, then a longer one with both open and the chosen one lit.
const unveilHoldMs = 1100
const twoCansHoldMs = 1500
const openHoldMs = 600

interface Props {
  cans: Cans
  // A line for a film's tooltip, above its runtime and description, by TMDB id.
  notes?: Record<number, string>
  // 1 for the full show; a test or reduced motion makes every beat nearly instant.
  scale?: number
  random: () => number
  onPick: (index: number) => void
  onTake: (index: number) => void
  // The arrow landed on the second can: it opens.
  onSettle: () => void
  // The sealed can the room took has opened.
  onOpen: () => void
  // The chosen can has been seen: its film is taken.
  onFinish: () => void
  // One tick of the arrow.
  onTick?: () => void
  // The drumroll starts, for this many milliseconds, before the sealed can opens.
  onRoll?: (ms: number) => void
}

// What the room does next, for a role=status line.
function prompt(cans: Cans): string {
  switch (phaseOf(cans)) {
    case 'picking':
      return 'Pick a can.'
    case 'ticking':
      return 'Which one opens next…'
    case 'unveiling':
      return `${cans.films[cans.choice ?? 0].title}. And the other can holds…`
    case 'choosing': {
      const films = cans.opened.map((i) => cans.films[i].title).join(' and ')
      return `Open: ${films}. Take one of the open films, or the sealed can.`
    }
    case 'opening':
      return 'Opening the sealed can…'
    default:
      return cans.choice === null ? '' : `${cans.films[cans.choice].title}.`
  }
}

// A movie card's films in sealed film cans. The room picks one, which flips open; an arrow ticks between the other
// two and lands on one, which flips open; then the room takes an open film, or the sealed can, which opens under a
// drumroll. A single film has no can, only a button.
export default function FilmCans({
  cans,
  notes,
  scale = 1,
  random,
  onPick,
  onTake,
  onSettle,
  onOpen,
  onFinish,
  onTick,
  onRoll,
}: Props) {
  const tipId = useId()
  const show = useRef<HTMLButtonElement>(null)
  const single = !hasCans(cans)
  const phase = phaseOf(cans)
  // The can the arrow points at while it ticks.
  const [pointer, setPointer] = useState<number | null>(null)
  // The latest callbacks, so a timer that outlives a render calls the current ones.
  const calls = useRef({ onSettle, onOpen, onFinish, onTick, onRoll, random })
  useEffect(() => {
    calls.current = { onSettle, onOpen, onFinish, onTick, onRoll, random }
  })

  useEffect(() => {
    if (single) show.current?.focus()
  }, [single])

  // The arrow's ticks, then the second can opens.
  useEffect(() => {
    if (phase !== 'ticking') return
    const path = tickPath(cans, calls.current.random)
    const timers: ReturnType<typeof setTimeout>[] = []
    let at = 0
    path.forEach((can, step) => {
      at += tickDelayMs(step, path.length) * scale
      timers.push(
        setTimeout(() => {
          setPointer(can)
          calls.current.onTick?.()
        }, at),
      )
    })
    timers.push(
      setTimeout(() => {
        setPointer(null)
        calls.current.onSettle()
      }, at + arrowSettleMs * scale),
    )
    return () => timers.forEach(clearTimeout)
    // The path is rolled once per pick: only the phase starts it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, scale])

  // With two cans: the picked film is seen, then the other can opens.
  useEffect(() => {
    if (phase !== 'unveiling') return
    const timer = setTimeout(() => calls.current.onSettle(), unveilHoldMs * scale)
    return () => clearTimeout(timer)
  }, [phase, scale])

  // The sealed can the room took: a drumroll, then it opens.
  useEffect(() => {
    if (phase !== 'opening') return
    calls.current.onRoll?.(drumrollMs * scale)
    const timer = setTimeout(() => calls.current.onOpen(), drumrollMs * scale)
    return () => clearTimeout(timer)
  }, [phase, scale])

  // The chosen can, open: held a moment, then taken.
  useEffect(() => {
    if (phase !== 'closing') return
    const sealed = cans.choice !== null && cans.choice !== cans.picked && cans.choice !== cans.second
    const hold = cans.films.length === 2 ? twoCansHoldMs : sealed ? sealedHoldMs : openHoldMs
    const timer = setTimeout(() => calls.current.onFinish(), hold * scale)
    return () => clearTimeout(timer)
  }, [phase, scale, cans.choice, cans.picked, cans.second, cans.films.length])

  if (single) {
    return (
      <div className="film-cans">
        <button ref={show} type="button" className="card-back-button" onClick={() => onTake(0)}>
          Show the film
        </button>
      </div>
    )
  }

  const picking = phase === 'picking'
  const choosing = phase === 'choosing'
  return (
    <div className="film-cans">
      <p className="film-cans-status" role="status">
        {prompt(cans)}
      </p>
      <ul className="film-cans-row" aria-label="Film cans">
        {cans.films.map((film, i) => {
          const open = cans.opened.includes(i)
          const year = film.year === null ? '' : ` (${film.year})`
          const name = picking
            ? `Pick can ${i + 1}`
            : open
              ? `Take ${film.title}${year}`
              : `Take the sealed can`
          const classes = ['can-slot']
          if (open) classes.push('can-open')
          // The chosen film is lit once everything it competes with has been seen.
          if (cans.choice === i && phase === 'closing') classes.push('can-chosen')
          return (
            <li key={film.tmdbId} className={classes.join(' ')}>
              <span className="can-arrow" data-on={pointer === i ? 'true' : undefined} aria-hidden="true" />
              <button
                type="button"
                className="can"
                aria-label={name}
                aria-describedby={open ? `${tipId}-${i}` : undefined}
                disabled={!picking && !choosing}
                onClick={() => (picking ? onPick(i) : onTake(i))}
              >
                <span className="can-turn">
                  <span className="can-sealed" aria-hidden="true">
                    <span className="can-reel">
                      <span className="can-label">Reel {i + 1}</span>
                    </span>
                  </span>
                  <span className="can-film" aria-hidden={open ? undefined : 'true'}>
                    {film.posterPath ? (
                      <img src={posterUrl(film.posterPath, 'w185')} alt="" />
                    ) : (
                      <span className="poster-placeholder" aria-hidden="true" />
                    )}
                    <span className="can-title">{film.title}</span>
                    {film.year !== null && <span className="can-year">{film.year}</span>}
                  </span>
                </span>
              </button>
              {open && (
                <span id={`${tipId}-${i}`} role="tooltip" className="can-tip">
                  {notes?.[film.tmdbId] && <span className="can-tip-note">{notes[film.tmdbId]}</span>}
                  {film.runtime !== null && <span className="can-tip-runtime">{formatRuntime(film.runtime)}</span>}
                  {film.overview.trim() || 'No description on TMDB.'}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
