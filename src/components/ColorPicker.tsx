import { useRef, type SyntheticEvent } from 'react'
import type { Viewer } from '../state/model.ts'
import { useApp } from '../state/store.ts'
import { presetColors, presetNames } from '../wheel/colors.ts'
import { placeUnder } from './placePopover.ts'

interface Props {
  viewer: Viewer
  roster: Viewer[]
  // Fires when the preset popover opens or closes.
  onToggle?: (e: SyntheticEvent<HTMLElement>) => void
}

// The viewer's colour swatch and the popover of the 12 presets it opens.
export default function ColorPicker({ viewer, roster, onToggle }: Props) {
  const { setViewerColor } = useApp()
  const popover = useRef<HTMLDivElement>(null)
  const id = `color-picker-${viewer.id}`
  return (
    <>
      <button
        type="button"
        className="swatch"
        aria-label={`${viewer.name}'s colour`}
        popoverTarget={id}
        style={{ background: viewer.color }}
        onClick={(e) => placeUnder(e, popover.current)}
      />
      <div id={id} popover="auto" ref={popover} className="card color-picker" onToggle={onToggle}>
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
