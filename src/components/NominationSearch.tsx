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

export default function NominationSearch({
  viewerId,
  viewerName,
  client,
  onAuthError,
}: Props) {
  const { night, nominate } = useApp()
  const nomination = night.nominations[viewerId]
  const [changing, setChanging] = useState(false)
  const [wonMessage, setWonMessage] = useState<string | null>(null)

  function onPick(picked: Nomination) {
    if (night.wonFilms.includes(picked.tmdbId)) {
      setWonMessage(`${picked.title} has already won tonight. Pick another film.`)
      return
    }
    setWonMessage(null)
    nominate(viewerId, picked)
    setChanging(false)
  }

  if (nomination && !changing) {
    return (
      <div>
        <Poster path={nomination.posterPath} title={nomination.title} />
        <span>
          {nomination.title}
          {nomination.year !== null && ` (${nomination.year})`}
        </span>
        <button type="button" onClick={() => setChanging(true)}>
          Change film for {viewerName}
        </button>
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
      {nomination && (
        <button type="button" className="quiet" onClick={() => setChanging(false)}>
          Keep current film
        </button>
      )}
      {wonMessage && <p role="alert">{wonMessage}</p>}
    </div>
  )
}
