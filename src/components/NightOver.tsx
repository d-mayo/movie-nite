import { letterboxdFilmUrl } from '../letterboxd/links.ts'
import { isGame } from '../state/model.ts'
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
  const hasGame = night.watched.some(isGame)
  return (
    <section className="night-over" aria-labelledby="night-over-heading">
      <h2 id="night-over-heading">Night over</h2>
      {night.watched.length > 0 ? (
        <>
          <p>{hasGame ? 'Watched tonight:' : 'Films watched tonight:'}</p>
          <ul>
            {night.watched.map((entry, i) =>
              isGame(entry) ? (
                <li key={`game-${i}`}>
                  <a className="film-link" href={entry.url} target="_blank" rel="noopener noreferrer">
                    {entry.name} (game)
                  </a>
                </li>
              ) : (
                <li key={entry.tmdbId}>
                  <FilmLink film={entry} />
                </li>
              ),
            )}
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
