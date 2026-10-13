import { viewersOnWheel } from '../state/model.ts'
import { useApp } from '../state/store.ts'

// A thin, dimmed key at the screen's left edge of the viewers still on the wheel, with their
// colors and films, for when the wheel carries no names and the viewer pane is slid away.
export default function ViewerKey() {
  const { settings, roster, night } = useApp()
  if (!settings.viewersHidden || settings.wheel.showLabels) return null
  const onWheel = viewersOnWheel(night)
  const viewers = roster.filter((v) => onWheel.includes(v.id))
  if (viewers.length === 0) return null
  return (
    <ul className="viewer-key" aria-label="Tonight's viewers">
      {viewers.map((v) => (
        <li key={v.id}>
          <span className="viewer-key-dot" style={{ background: v.color }} aria-hidden="true" />
          <span className="viewer-key-text">
            <span className="viewer-key-name">{v.name}</span>
            {night.nominations[v.id] && (
              <span className="viewer-key-title">{night.nominations[v.id].title}</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}
