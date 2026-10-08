import { useState, type FormEvent } from 'react'
import { maxNameLength, maxViewers, viewersOnWheel } from '../state/model.ts'
import { useApp } from '../state/store.ts'
import type { TmdbClient } from '../tmdb/client.ts'
import { materialiseDefault } from '../wheel/edit.ts'
import { WatchNextSession } from './NightOver.tsx'
import ViewerCell, { type CellStatus } from './ViewerCell.tsx'

interface Props {
  client: TmdbClient
  onAuthError: () => void
  locked?: boolean
}

const rank: Record<CellStatus, number> = { wheel: 0, won: 1, away: 2 }

// The viewer pane: one cell per roster viewer, on the wheel first, then those
// who have won tonight, then those who are away.
export default function NightSetup({ client, onAuthError, locked = false }: Props) {
  const { roster, night, addViewer } = useApp()
  const [name, setName] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  function hasWon(viewerId: string): boolean {
    const film = night.nominations[viewerId]
    return film !== undefined && night.wonFilms.includes(film.tmdbId)
  }

  function statusOf(viewerId: string): CellStatus {
    if (!night.presentIds.includes(viewerId)) return 'away'
    return hasWon(viewerId) ? 'won' : 'wheel'
  }

  const layout = night.layout ?? materialiseDefault(viewersOnWheel(night))
  // Array.prototype.sort is stable, so each group keeps roster order.
  const cells = roster
    .map((viewer) => ({ viewer, status: statusOf(viewer.id) }))
    .sort((a, b) => rank[a.status] - rank[b.status])

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
        <ul className="viewer-cells">
          {cells.map(({ viewer, status }) => (
            <ViewerCell
              key={viewer.id}
              viewer={viewer}
              roster={roster}
              status={status}
              won={hasWon(viewer.id)}
              film={night.nominations[viewer.id]}
              setting={layout.viewers[viewer.id]}
              open={openId === viewer.id}
              client={client}
              onAuthError={onAuthError}
              onHeaderClick={() => setOpenId(openId === viewer.id ? null : viewer.id)}
            />
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
