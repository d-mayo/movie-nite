import { useEffect, useState } from 'react'
import type { Nomination } from '../state/model.ts'
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
  label: string
  client: TmdbClient
  onAuthError: () => void
  onPick: (nomination: Nomination) => void
}

export function Poster({ path, title }: { path: string | null; title: string }) {
  return path ? (
    <img src={posterUrl(path, 'w92')} alt={`Poster of ${title}`} width="46" />
  ) : (
    <span aria-label="No poster" role="img" className="poster-placeholder" />
  )
}

// Type-ahead film search; reports the picked film's full details through onPick.
export default function FilmSearch({ label, client, onAuthError, onPick }: Props) {
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
      const nomination = await client.getMovie(result.tmdbId)
      setQuery('')
      setFound(undefined)
      onPick(nomination)
    } catch (error) {
      if (error instanceof TmdbAuthError) onAuthError()
      else setPickError(result)
    }
  }

  const items = searching && found?.query === trimmed ? found.items : []

  return (
    <div>
      <label>
        {label}
        <input value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
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
