import { memo, useId } from 'react'
import { pinAngles, pinTrackRadius } from '../wheel/pins.ts'
import type { Wedge } from '../wheel/wedges.ts'

export const stripInner = 100
export const stripOuter = 112
const frameInner = 103.2
const frameOuter = 108.8
const holeRadii = [101.6, 110.4]
const holeStep = 2.5
const holeSize = 1.9
const holeCorner = 0.5
// A pin is a cream stud with a black ring, centered on the frame band (`pinTrackRadius`).
export const pinSize = 1.5
const frameInset = 0.25

const barPitch = 8
const barWidth = 4

// A clapper stick's bars: slanted parallelograms on a grid anchored at the middle radius,
// spanning `reach` either side of it.
export function barsPath(
  band: { top: number; bottom: number; slant: number },
  reach: number,
): string {
  const n = Math.ceil(reach / barPitch) + 2
  const parts: string[] = []
  for (let k = -n; k <= n; k++) {
    const x = k * barPitch - barWidth / 2 - band.slant / 2
    parts.push(
      `M ${x} ${band.top} h ${barWidth} l ${band.slant} ${band.bottom - band.top} h ${-barWidth} Z`,
    )
  }
  return parts.join(' ')
}

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
  const uid = useId().replace(/:/g, '')
  return (
    <g data-testid="reel">
      <circle r={(stripInner + stripOuter) / 2} fill="none" strokeWidth={stripOuter - stripInner} className="film-stock" />
      <circle r={stripOuter - 0.3} fill="none" strokeWidth="0.6" className="film-edge" />
      <path d={holes} className="film-hole" data-testid="sprocket-holes" />
      {wedges.map((wedge, i) => {
        const wild = wedge.slice.kind === 'wildcard'
        const d = framePath(wedge.arc.start, wedge.arc.end)
        const width = wedge.arc.end - wedge.arc.start
        const reach = width >= 180 ? frameOuter : frameOuter * Math.sin((width / 2) * (Math.PI / 180))
        return (
          <g key={i}>
            <path
              data-testid="frame"
              d={d}
              className={wild ? 'film-fill-stock' : undefined}
              fill={wild ? undefined : wedge.color}
              opacity="0.95"
            />
            {wild && (
              // The clapper's outer stick: cream bars on the frame's stock, slanted the other way from the inner one.
              <g clipPath={`url(#${uid}-frame-${i})`}>
                <clipPath id={`${uid}-frame-${i}`}>
                  <path d={d} />
                </clipPath>
                <g transform={`rotate(${(wedge.arc.start + wedge.arc.end) / 2})`}>
                  <path
                    data-testid="frame-stick"
                    className="film-fill-cream"
                    d={barsPath({ top: -frameOuter, bottom: -frameInner, slant: 7 }, reach)}
                  />
                </g>
              </g>
            )}
          </g>
        )
      })}
      {pinAngles(wedges.map((w) => w.arc)).map((angle) => {
        const [x, y] = point(angle, pinTrackRadius).split(' ')
        return <circle key={angle} data-testid="pin" cx={x} cy={y} r={pinSize} className="film-pin" />
      })}
      <circle data-testid="reel-ring" r={stripInner} fill="none" strokeWidth="0.8" className="film-edge" />
    </g>
  )
}

export default memo(Reel)
