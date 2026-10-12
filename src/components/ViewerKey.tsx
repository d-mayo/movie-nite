import { useApp } from '../state/store.ts'

// A thin, dimmed key of tonight's viewers and their colors, for when the wheel carries no
// names and the viewer pane is slid away.
export default function ViewerKey() {
  const { settings, roster, night } = useApp()
  if (!settings.viewersHidden || settings.wheel.showLabels) return null
  const present = roster.filter((v) => night.presentIds.includes(v.id))
  if (present.length === 0) return null
  return (
    <ul className="viewer-key" aria-label="Tonight's viewers">
      {present.map((v) => (
        <li key={v.id}>
          {v.name}
          <span className="viewer-key-dot" style={{ background: v.color }} aria-hidden="true" />
        </li>
      ))}
    </ul>
  )
}
