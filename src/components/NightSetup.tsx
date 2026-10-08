import { useRef, useState, type FormEvent } from 'react'
import { maxNameLength, maxViewers, type Viewer } from '../state/model.ts'
import { presetColors, presetNames } from '../wheel/colors.ts'
import { useApp } from '../state/store.ts'
import type { TmdbClient } from '../tmdb/client.ts'
import { Poster } from './FilmSearch.tsx'
import NominationSearch from './NominationSearch.tsx'
import { filmLabel, WatchNextSession } from './NightOver.tsx'

interface Props {
  client: TmdbClient
  onAuthError: () => void
  locked?: boolean
}

function ColorPicker({ viewer, roster }: { viewer: Viewer; roster: Viewer[] }) {
  const { setViewerColor } = useApp()
  const popover = useRef<HTMLDivElement>(null)
  const id = `color-picker-${viewer.id}`
  // The popover is fixed, so it is placed under its button when opened.
  function place(e: React.MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const el = popover.current
    if (!el) return
    el.style.top = `${rect.bottom + 4}px`
    el.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 240))}px`
  }
  return (
    <>
      <button
        type="button"
        className="swatch"
        aria-label={`${viewer.name}'s colour`}
        popoverTarget={id}
        style={{ background: viewer.color }}
        onClick={place}
      />
      <div id={id} popover="auto" ref={popover} className="card color-picker">
        {presetColors.map((color) => {
          const holder = roster.find((v) => v.color === color && v.id !== viewer.id)
          return (
            <button
              key={color}
              type="button"
              className="swatch"
              style={{ background: color }}
              aria-label={holder ? `${presetNames[color]}, ${holder.name}'s colour` : presetNames[color]}
              aria-pressed={color === viewer.color}
              disabled={holder !== undefined}
              onClick={() => {
                setViewerColor(viewer.id, color)
                popover.current?.hidePopover()
              }}
            />
          )
        })}
      </div>
    </>
  )
}

export default function NightSetup({ client, onAuthError, locked = false }: Props) {
  const { roster, night, addViewer, removeViewer, setPresent } = useApp()
  const [name, setName] = useState('')

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
    <section className="card">
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
              <ColorPicker viewer={viewer} roster={roster} />
              <button
                type="button"
                className="danger"
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
          <button type="submit" className="primary" disabled={roster.length >= maxViewers}>
            Add
          </button>
          {roster.length >= maxViewers && (
            <p>The roster is full (12 viewers). Remove a viewer to add another.</p>
          )}
        </form>
        <WatchNextSession />
      </fieldset>
    </section>
  )
}
