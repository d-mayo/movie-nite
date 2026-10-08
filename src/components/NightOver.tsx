import { useApp } from '../state/store.ts'

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
