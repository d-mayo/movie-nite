import { useState } from 'react'
import type { Nomination } from '../state/model.ts'
import { useApp } from '../state/store.ts'
import type { TmdbClient } from '../tmdb/client.ts'
import FilmSearch, { Poster } from './FilmSearch.tsx'

interface Props {
  viewerId: string
  viewerName: string
  client: TmdbClient
  onAuthError: () => void
}

// A viewer with a film shows its poster, with an X on hover that takes the film
// off the wheel; a viewer without one gets the search.
export default function NominationSearch({
  viewerId,
  viewerName,
  client,
  onAuthError,
}: Props) {
  const { night, nominate, removeNomination } = useApp()
  const nomination = night.nominations[viewerId]
  const [wonMessage, setWonMessage] = useState<string | null>(null)

  function onPick(picked: Nomination) {
    if (night.wonFilms.includes(picked.tmdbId)) {
      setWonMessage(`${picked.title} has already won tonight. Pick another film.`)
      return
    }
    setWonMessage(null)
    nominate(viewerId, picked)
  }

  if (nomination) {
    return (
      <div className="nomination">
        <span className="poster-remove">
          <Poster path={nomination.posterPath} title={nomination.title} />
          <button
            type="button"
            className="poster-x"
            aria-label={`Remove ${nomination.title} from ${viewerName}`}
            onClick={() => removeNomination(viewerId)}
          >
            <span aria-hidden="true">✕</span>
          </button>
        </span>
        <span>
          {nomination.title}
          {nomination.year !== null && ` (${nomination.year})`}
        </span>
      </div>
    )
  }

  return (
    <div>
      <FilmSearch
        label={`Search a film for ${viewerName}`}
        client={client}
        onAuthError={onAuthError}
        onPick={onPick}
      />
      {wonMessage && <p role="alert">{wonMessage}</p>}
    </div>
  )
}
