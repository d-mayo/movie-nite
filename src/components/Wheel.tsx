import { useId, type Ref } from 'react'
import { posterUrl } from '../tmdb/client.ts'
import { mixColor } from '../wheel/colors.ts'
import type { Wedge } from '../wheel/wedges.ts'
import Reel from './Reel.tsx'

// The flapper hangs from a pivot screw above the strip; its tip reaches inside the pins.
export const pivotY = -118
const tongue = 'M -3.4 -118 L 3.4 -118 L 0.7 -103.3 Q 0 -102.3 -0.7 -103.3 Z'

const radius = 100
const posterInner = 30
const titleMinDegrees = 24
const titleMaxChars = 14
const wildcardStops = ['#0d0d0c', '#2a2a27', '#4a4a44']

function point(angle: number, r: number): string {
  const rad = (angle * Math.PI) / 180
  return `${(r * Math.sin(rad)).toFixed(3)} ${(-r * Math.cos(rad)).toFixed(3)}`
}

function wedgePath({ arc }: Wedge): string {
  const large = arc.end - arc.start > 180 ? 1 : 0
  return `M 0 0 L ${point(arc.start, radius)} A ${radius} ${radius} 0 ${large} 1 ${point(arc.end, radius)} Z`
}

function clip(text: string): string {
  return text.length > titleMaxChars ? `${text.slice(0, titleMaxChars - 1)}…` : text
}

// A rough text width in SVG units, enough to size the scrim under a label.
function labelWidth(text: string | null): number {
  return (text ?? '').length * 4.7
}

// The gradients are shared: one per distinct viewer color, and one for wildcards.
function gradientId(uid: string, color: string | null): string {
  return `${uid}-${color === null ? 'wild' : color.slice(1)}`
}

function Defs({ uid, colors }: { uid: string; colors: string[] }) {
  return (
    <defs>
      <radialGradient id={gradientId(uid, null)} gradientUnits="userSpaceOnUse" cx="0" cy="0" r={radius}>
        <stop offset="0" stopColor={wildcardStops[0]} />
        <stop offset="0.6" stopColor={wildcardStops[1]} />
        <stop offset="1" stopColor={wildcardStops[2]} />
      </radialGradient>
      {colors.map((color) => (
        <radialGradient key={color} id={gradientId(uid, color)} gradientUnits="userSpaceOnUse" cx="0" cy="0" r={radius}>
          <stop offset="0" stopColor={mixColor(color, '#000000', 0.6)} />
          <stop offset="0.3" stopColor={mixColor(color, '#000000', 0.32)} />
          <stop offset="0.75" stopColor={color} />
          <stop offset="1" stopColor={mixColor(color, '#ffffff', 0.14)} />
        </radialGradient>
      ))}
      {colors.map((color) => {
        return (
          // Over the poster's inner part: clear at 64 from the hub, the wedge's own shade at 30.
          <linearGradient
            key={color}
            id={`${gradientId(uid, color)}-fade`}
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1={-64}
            x2="0"
            y2={-posterInner}
          >
            <stop offset="0" stopColor={mixColor(color, '#000000', 0.22)} stopOpacity="0" />
            <stop offset="1" stopColor={mixColor(color, '#000000', 0.3)} stopOpacity="1" />
          </linearGradient>
        )
      })}
      <radialGradient id={`${uid}-gloss`} gradientUnits="userSpaceOnUse" cx="-38" cy="-48" r="125">
        <stop offset="0" stopColor="#ffffff" stopOpacity="0.24" />
        <stop offset="0.55" stopColor="#ffffff" stopOpacity="0.04" />
        <stop offset="1" stopColor="#000000" stopOpacity="0.18" />
      </radialGradient>
    </defs>
  )
}

function WedgeShape({ wedge, id, uid }: { wedge: Wedge; id: string; uid: string }) {
  const { arc, slice, nomination } = wedge
  const mid = (arc.start + arc.end) / 2
  const width = arc.end - arc.start
  const half = (width / 2) * (Math.PI / 180)
  const imageWidth = Math.max(10, 2 * radius * Math.sin(half))
  const isWildcard = slice.kind === 'wildcard'
  const gradient = gradientId(uid, isWildcard ? null : wedge.color)
  const label = isWildcard ? 'WILDCARD' : clip(wedge.viewerName ?? '')
  const showTitle = nomination !== null && width >= titleMinDegrees
  const scrim = Math.max(
    labelWidth(label),
    showTitle ? (labelWidth(clip(nomination.title)) * 5) / 7.5 : 0,
  )

  return (
    <g data-testid="wedge" data-kind={slice.kind}>
      <clipPath id={`${uid}-clip-${id}`}>
        <path d={wedgePath(wedge)} />
      </clipPath>
      <path d={wedgePath(wedge)} fill={`url(#${gradient})`} stroke="#000000" strokeOpacity="0.4" strokeWidth="0.5" />
      {nomination?.posterPath && (
        <g clipPath={`url(#${uid}-clip-${id})`}>
          <g transform={`rotate(${mid})`}>
            <image
              href={posterUrl(nomination.posterPath, 'w185')}
              x={-imageWidth / 2}
              y={-radius}
              width={imageWidth}
              height={radius - posterInner}
              preserveAspectRatio="xMidYMid slice"
            />
            <rect
              data-testid="poster-fade"
              x={-imageWidth / 2}
              y={-64}
              width={imageWidth}
              height={38}
              fill={`url(#${gradient}-fade)`}
            />
          </g>
        </g>
      )}
      <g transform={`rotate(${mid - 90})`} className="wedge-text">
        <rect
          data-testid="scrim"
          x={radius - 6 - scrim}
          y={showTitle ? -6.5 : -4.5}
          width={scrim + 4}
          height={showTitle ? 16 : 9}
          rx="3"
          fill="#000000"
          opacity="0.42"
        />
        <text x={radius - 4} y={showTitle ? -2 : 0} textAnchor="end" dominantBaseline="central" fontSize="7.5" fontWeight="bold" fill="#ffffff">
          {label}
        </text>
        {showTitle && (
          <text x={radius - 4} y={6} textAnchor="end" dominantBaseline="central" fontSize="5" fill="#ffffff">
            {clip(nomination.title)}
          </text>
        )}
      </g>
    </g>
  )
}

interface Props {
  wedges: Wedge[]
  // The rotating group; its transform is written by the wheel's motion loop.
  groupRef: Ref<SVGGElement>
  // The flapper's group, turned about the pivot by the same loop.
  flapperRef?: Ref<SVGGElement>
}

export default function Wheel({ wedges, groupRef, flapperRef }: Props) {
  const uid = useId().replace(/:/g, '')
  if (wedges.length === 0) {
    return (
      <div className="wheel-empty">
        <p>Tick or add viewers to put them on the wheel.</p>
      </div>
    )
  }
  const colors = [...new Set(wedges.filter((w) => w.slice.kind !== 'wildcard').map((w) => w.color))]
  return (
    <svg viewBox="-124 -124 248 248" className="wheel" role="img" aria-label="Wheel">
      <Defs uid={uid} colors={colors} />
      <g ref={groupRef}>
        {wedges.map((wedge, i) => (
          <WedgeShape key={i} wedge={wedge} id={String(i)} uid={uid} />
        ))}
        <Reel wedges={wedges} />
      </g>
      <circle data-testid="gloss" r={radius} fill={`url(#${uid}-gloss)`} pointerEvents="none" />
      <g data-testid="pointer">
        <g ref={flapperRef} data-testid="flapper">
          <path d={tongue} className="film-tongue" />
        </g>
        <circle cy={pivotY} r="3.6" className="film-cap" />
        <rect x="-2.6" y={pivotY - 0.5} width="5.2" height="1" rx="0.3" className="film-slot" />
      </g>
    </svg>
  )
}
