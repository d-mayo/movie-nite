import { useState, type FormEvent } from 'react'
import { maxNameLength } from '../state/model.ts'
import { useApp } from '../state/store.ts'
import type { TmdbClient } from '../tmdb/client.ts'
import { Poster } from './FilmSearch.tsx'
import NominationSearch from './NominationSearch.tsx'
import { filmLabel, WatchNextSession } from './NightOver.tsx'

interface Props {
  client: TmdbClient
  onAuthError: () => void
  onChangeToken: () => void
  locked?: boolean
}

export default function NightSetup({ client, onAuthError, onChangeToken, locked = false }: Props) {
  const { roster, night, holdover, addViewer, removeViewer, setPresent, newNight } = useApp()
  const [name, setName] = useState('')
  const nightStarted =
    night.wonFilms.length > 0 || night.watched.length > 0 || night.ended || holdover !== null

  function isDone(viewerId: string): boolean {
    const film = night.nominations[viewerId]
    return film !== undefined && night.wonFilms.includes(film.tmdbId)
  }

  function add(e: FormEvent) {
    e.preventDefault()
    addViewer(name)
    setName('')
  }

  return (
    <section>
      <fieldset disabled={locked} className="setup">
        <h2>Tonight's viewers</h2>
        <p>Headcount: {night.presentIds.length}</p>
        <ul>
          {roster.map((viewer) => (
            <li key={viewer.id}>
              <label>
                <input
                  type="checkbox"
                  checked={night.presentIds.includes(viewer.id)}
                  onChange={(e) => setPresent(viewer.id, e.target.checked)}
                />
                {viewer.name}
              </label>
              <button
                type="button"
                aria-label={`Remove ${viewer.name}`}
                onClick={() => removeViewer(viewer.id)}
              >
                Remove
              </button>
              {night.presentIds.includes(viewer.id) &&
                (isDone(viewer.id) ? (
                  <div>
                    <Poster
                      path={night.nominations[viewer.id].posterPath}
                      title={night.nominations[viewer.id].title}
                    />
                    <span>{filmLabel(night.nominations[viewer.id])}</span>
                    <span> Won tonight</span>
                  </div>
                ) : (
                  <NominationSearch
                    viewerId={viewer.id}
                    viewerName={viewer.name}
                    client={client}
                    onAuthError={onAuthError}
                  />
                ))}
            </li>
          ))}
        </ul>
        <form onSubmit={add}>
          <label>
            Add a viewer
            <input maxLength={maxNameLength} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <button type="submit">Add</button>
        </form>
        {nightStarted && (
          <button type="button" onClick={newNight}>
            New night
          </button>
        )}
        <WatchNextSession />
        <button type="button" onClick={onChangeToken}>
          Change TMDB token
        </button>
      </fieldset>
    </section>
  )
}
