import { useState, type FormEvent } from 'react'
import { useApp } from '../state/store.ts'

export default function NightSetup({ onChangeToken }: { onChangeToken: () => void }) {
  const { roster, night, addViewer, removeViewer, setPresent, newNight } =
    useApp()
  const [name, setName] = useState('')
  const hasNominations = Object.keys(night.nominations).length > 0

  function add(e: FormEvent) {
    e.preventDefault()
    addViewer(name)
    setName('')
  }

  return (
    <section>
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
          </li>
        ))}
      </ul>
      <form onSubmit={add}>
        <label>
          Add a viewer
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button type="submit">Add</button>
      </form>
      {hasNominations && (
        <button type="button" onClick={newNight}>
          New night
        </button>
      )}
      <button type="button" onClick={onChangeToken}>
        Change TMDB token
      </button>
    </section>
  )
}
