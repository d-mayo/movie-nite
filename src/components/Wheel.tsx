import { posterUrl } from '../tmdb/client.ts'
import { useApp } from '../state/store.ts'
import { buildWedges, type Wedge } from '../wheel/wedges.ts'

const radius = 100
const posterInner = 22
const titleMinDegrees = 24
const titleMaxChars = 14

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

function WedgeShape({ wedge, id }: { wedge: Wedge; id: string }) {
  const { arc, slice, nomination } = wedge
  const mid = (arc.start + arc.end) / 2
  const width = arc.end - arc.start
  const half = (width / 2) * (Math.PI / 180)
  const imageWidth = Math.max(10, 2 * radius * Math.sin(half))
  const label = slice.kind === 'wildcard' ? 'WILDCARD' : wedge.viewerName
  const showTitle = nomination !== null && width >= titleMinDegrees

  return (
    <g data-testid="wedge" data-kind={slice.kind}>
      <clipPath id={`clip-${id}`}>
        <path d={wedgePath(wedge)} />
      </clipPath>
      <path d={wedgePath(wedge)} fill={wedge.color} stroke="#fff" strokeWidth="0.6" />
      {nomination?.posterPath && (
        <g clipPath={`url(#clip-${id})`}>
          <g transform={`rotate(${mid})`}>
            <image
              href={posterUrl(nomination.posterPath, 'w185')}
              x={-imageWidth / 2}
              y={-radius}
              width={imageWidth}
              height={radius - posterInner}
              preserveAspectRatio="xMidYMid slice"
            />
          </g>
        </g>
      )}
      <g transform={`rotate(${mid - 90})`} fill="#fff" className="wedge-text">
        <text x={radius - 4} y={showTitle ? -2 : 0} textAnchor="end" dominantBaseline="central" fontSize="6" fontWeight="bold">
          {label}
        </text>
        {showTitle && (
          <text x={radius - 4} y={5} textAnchor="end" dominantBaseline="central" fontSize="4">
            {clip(nomination.title)}
          </text>
        )}
      </g>
    </g>
  )
}

interface Props {
  wedges: Wedge[]
  rotation: number
}

export default function Wheel({ wedges, rotation }: Props) {
  if (wedges.length === 0) {
    return (
      <div className="wheel-empty">
        <p>Tick or add viewers to put them on the wheel.</p>
      </div>
    )
  }
  return (
    <svg viewBox="-108 -108 216 216" className="wheel" role="img" aria-label="Wheel">
      <g transform={`rotate(${rotation})`}>
        {wedges.map((wedge, i) => (
          <WedgeShape key={i} wedge={wedge} id={String(i)} />
        ))}
      </g>
      <polygon data-testid="pointer" points="-6,-108 6,-108 0,-92" fill="#ffd54a" stroke="#000" strokeWidth="1" />
    </svg>
  )
}

export function LiveWheel() {
  const { night, roster } = useApp()
  return <Wheel wedges={buildWedges(night, roster)} rotation={0} />
}
