import { useEffect, useState } from 'react'
import { useApp } from '../state/store.ts'
import {
  posterUrl,
  TmdbAuthError,
  type SearchResult,
  type TmdbClient,
} from '../tmdb/client.ts'

const debounceMs = 300
const minQueryLength = 2
const maxResults = 8

interface Props {
  viewerId: string
  viewerName: string
  client: TmdbClient
  onAuthError: () => void
}

function Poster({ path, title }: { path: string | null; title: string }) {
  return path ? (
    <img src={posterUrl(path, 'w92')} alt={`Poster of ${title}`} width="46" />
  ) : (
    <span aria-label="No poster" role="img" className="poster-placeholder" />
  )
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
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<{ query: string; items: SearchResult[] }>()
  const [searchError, setSearchError] = useState<string | null>(null)
  const [pickError, setPickError] = useState<SearchResult | null>(null)

  const trimmed = query.trim()
  const searching = trimmed.length >= minQueryLength

  useEffect(() => {
    if (!searching) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      client
        .searchMovies(trimmed, controller.signal)
        .then((items) => {
          if (controller.signal.aborted) return
          setSearchError(null)
          setFound({ query: trimmed, items: items.slice(0, maxResults) })
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return
          if (error instanceof TmdbAuthError) onAuthError()
          else setSearchError('Search failed. Try again.')
        })
    }, debounceMs)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [trimmed, searching, client, onAuthError])

  async function pick(result: SearchResult) {
    setPickError(null)
    try {
      nominate(viewerId, await client.getMovie(result.tmdbId))
      setChanging(false)
      setQuery('')
      setFound(undefined)
    } catch (error) {
      if (error instanceof TmdbAuthError) onAuthError()
      else setPickError(result)
    }
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

  const items = searching && found?.query === trimmed ? found.items : []

  return (
    <div>
      <label>
        Search a film for {viewerName}
        <input value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      {nomination && (
        <button type="button" onClick={() => setChanging(false)}>
          Keep current film
        </button>
      )}
      {searching && searchError && <p role="alert">{searchError}</p>}
      {pickError && (
        <p role="alert">
          Could not load {pickError.title}.{' '}
          <button type="button" onClick={() => pick(pickError)}>
            Retry
          </button>
        </p>
      )}
      <ul>
        {items.map((r) => (
          <li key={r.tmdbId}>
            <button
              type="button"
              aria-label={`Pick ${r.title}${r.year !== null ? ` (${r.year})` : ''}`}
              onClick={() => pick(r)}
            >
              <Poster path={r.posterPath} title={r.title} />
              <span>
                {r.title}
                {r.year !== null && ` (${r.year})`}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
