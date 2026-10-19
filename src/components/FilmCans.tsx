import { useEffect, useRef } from 'react'
import { posterUrl } from '../tmdb/client.ts'
import { hasCans, type Cans } from '../wildcards/cans.ts'

interface Props {
  cans: Cans
  onPick: (index: number) => void
  onTake: (index: number) => void
}

// What the room does next, for a role=status line.
function prompt(cans: Cans): string {
  if (!hasCans(cans)) return 'One film turned up.'
  if (cans.picked === null) return 'Pick a can.'
  const films = cans.opened.map((i) => cans.films[i].title).join(' and ')
  return `Open: ${films}. Take one of the open films, or the sealed can.`
}

// A movie card's films in sealed cans (interim look: plain buttons on film stock). The room picks one, it opens
// with one other, and the room takes an open film or the sealed can. A single film has no can, only a button.
export default function FilmCans({ cans, onPick, onTake }: Props) {
  const show = useRef<HTMLButtonElement>(null)
  const single = !hasCans(cans)
  useEffect(() => {
    if (single) show.current?.focus()
  }, [single])

  if (single) {
    return (
      <div className="film-cans">
        <button ref={show} type="button" className="card-back-button" onClick={() => onTake(0)}>
          Show the film
        </button>
      </div>
    )
  }

  const picking = cans.picked === null
  return (
    <div className="film-cans">
      <p className="film-cans-status" role="status">
        {prompt(cans)}
      </p>
      <ul className="film-cans-row" aria-label="Film cans">
        {cans.films.map((film, i) => {
          const open = cans.opened.includes(i)
          const year = film.year === null ? '' : ` (${film.year})`
          return (
            <li key={film.tmdbId}>
              <button
                type="button"
                className={open ? 'can can-open' : 'can'}
                aria-label={
                  picking ? `Pick can ${i + 1}` : open ? `Take ${film.title}${year}` : `Take the sealed can`
                }
                disabled={cans.taken !== null}
                onClick={() => (picking ? onPick(i) : onTake(i))}
              >
                {open ? (
                  <>
                    {film.posterPath ? (
                      <img src={posterUrl(film.posterPath)} alt="" width="92" />
                    ) : (
                      <span className="poster-placeholder" aria-hidden="true" />
                    )}
                    <span className="can-title">{film.title}</span>
                    {film.year !== null && <span className="can-year">{film.year}</span>}
                  </>
                ) : (
                  <span className="can-seal" aria-hidden="true">
                    {i + 1}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
