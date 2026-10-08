import { useApp } from '../state/store.ts'
import { Poster } from './FilmSearch.tsx'

export function filmLabel(film: { title: string; year: number | null }): string {
  return film.year !== null ? `${film.title} (${film.year})` : film.title
}

export default function NightOver() {
  const { night, holdover } = useApp()
  return (
    <section className="night-over" aria-labelledby="night-over-heading">
      <h2 id="night-over-heading">Night over</h2>
      {night.watched.length > 0 ? (
        <>
          <p>Films watched tonight:</p>
          <ul>
            {night.watched.map((film) => (
              <li key={film.tmdbId}>{filmLabel(film)}</li>
            ))}
          </ul>
        </>
      ) : (
        <p>No films were watched tonight.</p>
      )}
      {holdover && <p>Watch next session: {filmLabel(holdover)}</p>}
    </section>
  )
}

export function WatchNextSession() {
  const { holdover, clearHoldover } = useApp()
  if (!holdover) return null
  return (
    <section aria-labelledby="holdover-heading">
      <h3 id="holdover-heading">Watch next session</h3>
      <Poster path={holdover.posterPath} title={holdover.title} />
      <span>{filmLabel(holdover)}</span>
      <button type="button" onClick={clearHoldover}>
        Clear Watch next session film
      </button>
    </section>
  )
}
