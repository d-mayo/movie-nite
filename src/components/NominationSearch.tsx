import { useEffect, useRef, useState } from 'react'
import { drawFromWatchlist, type DrawResult, type WatchlistSource } from '../letterboxd/watchlist.ts'
import type { LetterboxdLink, Nomination } from '../state/model.ts'
import { useApp } from '../state/store.ts'
import type { TmdbClient } from '../tmdb/client.ts'
import FilmSearch, { Poster } from './FilmSearch.tsx'

interface Props {
  viewerId: string
  viewerName: string
  client: TmdbClient
  // The viewer's Letterboxd profile and where to draw from; a draw is offered only for a found profile.
  letterboxd?: LetterboxdLink
  watchlist?: WatchlistSource
}

function Dice() {
  return (
    <svg className="dice" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" />
      <g fill="currentColor" stroke="none">
        <circle cx="8.5" cy="8.5" r="1.4" />
        <circle cx="15.5" cy="8.5" r="1.4" />
        <circle cx="12" cy="12" r="1.4" />
        <circle cx="8.5" cy="15.5" r="1.4" />
        <circle cx="15.5" cy="15.5" r="1.4" />
      </g>
    </svg>
  )
}

// A viewer with a film shows its poster, with an X on hover that takes the film
// off the wheel; a viewer without one gets the search. A viewer whose Letterboxd
// profile was found can also draw a film from their watchlist, as the first
// nomination (the slot) or a replacement (Re-roll).
export default function NominationSearch({ viewerId, viewerName, client, letterboxd, watchlist }: Props) {
  const { night, holdover, nominate, removeNomination } = useApp()
  const nomination = night.nominations[viewerId]
  const [wonMessage, setWonMessage] = useState<string | null>(null)
  const [drawing, setDrawing] = useState(false)
  const [drawMessage, setDrawMessage] = useState<string | null>(null)
  // Aborted when the panel closes (this unmounts), so a result that arrives late nominates nothing.
  const lifetime = useRef<AbortController | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    return () => controller.abort()
  }, [])

  const canDraw = !!watchlist && letterboxd?.status === 'found'
  const canReroll = canDraw && !!nomination && watchlist.memory.drawn.get(viewerId) === nomination.tmdbId

  function onPick(picked: Nomination) {
    if (night.wonFilms.includes(picked.tmdbId)) {
      setWonMessage(`${picked.title} has already won tonight. Pick another film.`)
      return
    }
    setWonMessage(null)
    nominate(viewerId, picked)
  }

  function messageFor(result: Exclude<DrawResult, number>): string {
    switch (result) {
      case 'empty':
        return `${viewerName}'s watchlist is empty.`
      case 'exhausted':
        return `Every film on ${viewerName}'s watchlist is already in play tonight.`
      case 'private':
        return `${viewerName}'s watchlist is private.`
      case 'missing':
        return `Letterboxd has no watchlist for ${letterboxd?.username ?? viewerName}.`
      case 'unavailable':
        return "Letterboxd can't be reached right now."
    }
  }

  async function draw() {
    if (!watchlist || !letterboxd || drawing) return
    const signal = lifetime.current?.signal
    const excluded = new Set<number>(Object.values(night.nominations).map((film) => film.tmdbId))
    for (const id of night.wonFilms) excluded.add(id)
    if (holdover) excluded.add(holdover.tmdbId)
    setDrawing(true)
    setDrawMessage(null)
    try {
      const result = await drawFromWatchlist({
        client: watchlist.client,
        memory: watchlist.memory,
        username: letterboxd.username,
        excluded,
        random: watchlist.random,
      })
      if (signal?.aborted) return
      if (typeof result === 'string') {
        setDrawMessage(messageFor(result))
        return
      }
      let drawn: Nomination
      try {
        drawn = await client.getMovie(result)
      } catch {
        if (!signal?.aborted) setDrawMessage("The drawn film couldn't be loaded. Try again.")
        return
      }
      if (signal?.aborted) return
      setWonMessage(null)
      watchlist.memory.drawn.set(viewerId, drawn.tmdbId)
      nominate(viewerId, drawn)
    } finally {
      if (!signal?.aborted) setDrawing(false)
    }
  }

  const status = drawMessage && (
    <span role="status" className="draw-message">
      {drawMessage}
    </span>
  )

  if (nomination) {
    return (
      <div className="nomination">
        <span className="poster-remove">
          <Poster path={nomination.posterPath} title={nomination.title} large />
          <button
            type="button"
            className="poster-x"
            aria-label={`Remove ${nomination.title} from ${viewerName}`}
            onClick={() => removeNomination(viewerId)}
          >
            <span aria-hidden="true">✕</span>
          </button>
        </span>
        <span className="nomination-text">
          <span className="nomination-title">{nomination.title}</span>
          {nomination.year !== null && <span className="nomination-year">({nomination.year})</span>}
          {canReroll && (
            <button type="button" className="quiet reroll" disabled={drawing} aria-busy={drawing} onClick={draw}>
              <Dice />
              Re-roll
              <span className="dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </button>
          )}
          {status}
        </span>
      </div>
    )
  }

  return (
    <div className="nomination-pick">
      {canDraw && (
        <button type="button" className="draw-slot" disabled={drawing} aria-busy={drawing} onClick={draw}>
          <Dice />
          <span>{drawing ? 'Drawing…' : 'Random from watchlist'}</span>
        </button>
      )}
      <div className="nomination-search">
        <FilmSearch label={`Search a film for ${viewerName}`} client={client} onPick={onPick} />
        {wonMessage && <p role="alert">{wonMessage}</p>}
        {status}
      </div>
    </div>
  )
}
