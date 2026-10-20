import { letterboxdFilmUrl } from '../letterboxd/links.ts'
import { watchedFilms } from '../state/model.ts'
import { useApp } from '../state/store.ts'

export function filmLabel(film: { title: string; year: number | null }): string {
  return film.year !== null ? `${film.title} (${film.year})` : film.title
}

function FilmLink({ film }: { film: { tmdbId: number; title: string; year: number | null } }) {
  return (
    <a
      className="film-link"
      href={letterboxdFilmUrl(film.tmdbId)}
      target="_blank"
      rel="noopener noreferrer"
      title="Open on Letterboxd"
    >
      {filmLabel(film)}
    </a>
  )
}

export default function NightOver() {
  const { night, holdover } = useApp()
  const films = watchedFilms(night)
  return (
    <section className="night-over" aria-labelledby="night-over-heading">
      <h2 id="night-over-heading">Night over</h2>
      {films.length > 0 ? (
        <>
          <p>Films watched tonight:</p>
          <ul>
            {films.map((film) => (
              <li key={film.tmdbId}>
                <FilmLink film={film} />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>No films were watched tonight.</p>
      )}
      {night.cardEffects.length > 0 && (
        <>
          <p>Cards tonight:</p>
          <ul aria-label="Cards tonight">
            {night.cardEffects.map((effect, i) => (
              <li key={i}>{effect.label}</li>
            ))}
          </ul>
        </>
      )}
      {holdover && (
        <p>
          Watch next session: <FilmLink film={holdover} />
        </p>
      )}
    </section>
  )
}
