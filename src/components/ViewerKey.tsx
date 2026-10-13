import { useEffect, useState } from 'react'
import { viewersOnWheel } from '../state/model.ts'
import { useApp } from '../state/store.ts'

const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16

// How many rows fit above the Show viewers tab, which sits at the screen's vertical middle:
// the key starts 6rem down, each row is about 2.75rem, and the tab reaches 2.5rem above the middle.
function rowsAbove(): number {
  const r = rem()
  return Math.max(1, Math.floor((window.innerHeight / 2 - 8.5 * r) / (2.75 * r)))
}

// A thin, dimmed key of the viewers still on the wheel, with their colors and films, for when
// the wheel carries no names and the viewer pane is slid away.
export default function ViewerKey() {
  const { settings, roster, night } = useApp()
  const [rows, setRows] = useState(rowsAbove)
  useEffect(() => {
    const onResize = () => setRows(rowsAbove())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  if (!settings.viewersHidden || settings.wheel.showLabels) return null
  const onWheel = viewersOnWheel(night)
  const viewers = roster.filter((v) => onWheel.includes(v.id))
  if (viewers.length === 0) return null
  return (
    <ul
      className="viewer-key"
      aria-label="Tonight's viewers"
      style={{ gridTemplateRows: `repeat(${Math.min(rows, viewers.length)}, auto)` }}
    >
      {viewers.map((v) => (
        <li key={v.id}>
          <span className="viewer-key-text">
            <span className="viewer-key-name">{v.name}</span>
            {night.nominations[v.id] && (
              <span className="viewer-key-title">{night.nominations[v.id].title}</span>
            )}
          </span>
          <span className="viewer-key-dot" style={{ background: v.color }} aria-hidden="true" />
        </li>
      ))}
    </ul>
  )
}
