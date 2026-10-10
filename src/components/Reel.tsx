import { memo } from 'react'
import type { Wedge } from '../wheel/wedges.ts'

export const stripInner = 100
export const stripOuter = 112
const frameInner = 103.2
const frameOuter = 108.8
const holeRadii = [101.6, 110.4]
const holeStep = 2.5
const holeSize = 1.9
const holeCorner = 0.5
const frameInset = 0.25
export const wildcardFrame = '#5a5a54'

function rotated(x: number, y: number, angle: number): string {
  const rad = (angle * Math.PI) / 180
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  return `${(x * c - y * s).toFixed(2)} ${(x * s + y * c).toFixed(2)}`
}

// One sprocket hole: a rounded square centered at `radius` and turned `angle` degrees clockwise.
function holePath(radius: number, angle: number): string {
  const h = holeSize / 2
  const k = holeCorner
  const cy = -radius
  const p = (x: number, y: number) => rotated(x, cy + y, angle)
  return [
    `M ${p(-h + k, -h)}`,
    `L ${p(h - k, -h)} Q ${p(h, -h)} ${p(h, -h + k)}`,
    `L ${p(h, h - k)} Q ${p(h, h)} ${p(h - k, h)}`,
    `L ${p(-h + k, h)} Q ${p(-h, h)} ${p(-h, h - k)}`,
    `L ${p(-h, -h + k)} Q ${p(-h, -h)} ${p(-h + k, -h)} Z`,
  ].join(' ')
}

// The 288 holes are the same on every wheel, so they are built once.
const holes = holeRadii
  .flatMap((r) => Array.from({ length: 360 / holeStep }, (_, i) => holePath(r, i * holeStep + holeStep / 2)))
  .join(' ')

function point(angle: number, r: number): string {
  const rad = (angle * Math.PI) / 180
  return `${(r * Math.sin(rad)).toFixed(3)} ${(-r * Math.cos(rad)).toFixed(3)}`
}

function framePath(start: number, end: number): string {
  const inset = end - start > 4 * frameInset ? frameInset : 0
  const a = start + inset
  const b = end - inset
  const large = b - a > 180 ? 1 : 0
  return `M ${point(a, frameInner)} L ${point(a, frameOuter)} A ${frameOuter} ${frameOuter} 0 ${large} 1 ${point(b, frameOuter)} L ${point(b, frameInner)} A ${frameInner} ${frameInner} 0 ${large} 0 ${point(a, frameInner)} Z`
}

// The film strip round the wheel: stock, a frame per slice, and sprocket holes.
function Reel({ wedges }: { wedges: Wedge[] }) {
  return (
    <g data-testid="reel">
      <circle r={(stripInner + stripOuter) / 2} fill="none" strokeWidth={stripOuter - stripInner} className="film-stock" />
      <circle r={stripOuter - 0.3} fill="none" strokeWidth="0.6" className="film-edge" />
      <path d={holes} className="film-hole" data-testid="sprocket-holes" />
      {wedges.map((wedge, i) => (
        <path
          key={i}
          data-testid="frame"
          d={framePath(wedge.arc.start, wedge.arc.end)}
          fill={wedge.slice.kind === 'wildcard' ? wildcardFrame : wedge.color}
          opacity="0.95"
        />
      ))}
      <circle data-testid="reel-ring" r={stripInner} fill="none" strokeWidth="0.8" className="film-edge" />
    </g>
  )
}

export default memo(Reel)
