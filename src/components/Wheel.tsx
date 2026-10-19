import { useId, useState, type Ref } from 'react'
import { posterUrl } from '../tmdb/client.ts'
import { mixColor } from '../wheel/colors.ts'
import { layoutCardLabel, layoutLabel, layoutWatermark, layoutWildcard, markHeight, markWidth, sticksInner } from '../wheel/labels.ts'
import { pivotY } from '../wheel/pins.ts'
import { blindColor, type CardGlyph, type Wedge } from '../wheel/wedges.ts'
import Reel, { barsPath } from './Reel.tsx'

// The flapper's tongue hangs from the pivot screw at `pivotY`; its tip reaches inside the pins.
const tongue = 'M -3.4 -118 L 3.4 -118 L 0.7 -103.3 Q 0 -102.3 -0.7 -103.3 Z'

const radius = 100
const posterInner = 30

function point(angle: number, r: number): string {
  const rad = (angle * Math.PI) / 180
  return `${(r * Math.sin(rad)).toFixed(3)} ${(-r * Math.cos(rad)).toFixed(3)}`
}

function wedgePath({ arc }: Wedge): string {
  const large = arc.end - arc.start > 180 ? 1 : 0
  return `M 0 0 L ${point(arc.start, radius)} A ${radius} ${radius} 0 ${large} 1 ${point(arc.end, radius)} Z`
}

// The gradients are shared: one per distinct viewer color.
function gradientId(uid: string, color: string): string {
  return `${uid}-${color.slice(1)}`
}

function Defs({ uid, colors }: { uid: string; colors: string[] }) {
  return (
    <defs>
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
            <stop offset="0.6" stopColor={mixColor(color, '#000000', 0.28)} stopOpacity="0.4" />
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

const stick = { outer: radius, inner: sticksInner, slant: -7 }

// The M of the Movie Nite logo, a copy of the dark icon's inner group (src/assets/logo/logo-icon-dark.svg)
// that a test keeps identical; its colors come from the film palette by class.
function Mark() {
  return (
    <>
      <g className="film-mark-leg" strokeWidth="22" strokeLinejoin="round">
        <rect x="35" y="33" width="85" height="350" />
        <path d="M363 33H450V383H365V170L274.3 318H225L219 290Z" />
      </g>
      <path className="film-mark-strip" d="M23.5 21.5H145.5L369.0 394.0H247.0Z" />
      <g className="film-fill-stock">
        <rect x="93.5" y="55.8" width="58" height="58" rx="13.9" transform="rotate(-31.0 122.5 84.8)" />
        <rect x="167.3" y="178.8" width="58" height="58" rx="13.9" transform="rotate(-31.0 196.3 207.8)" />
        <rect x="241.0" y="301.7" width="58" height="58" rx="13.9" transform="rotate(-31.0 270.0 330.7)" />
      </g>
    </>
  )
}

// A wildcard's clapperboard slate, drawn in the slice's own turned frame so every wildcard
// looks the same whatever its angle: two striped sticks at the rim and the logo's M between
// them and the hub. The body is drawn by the caller.
function Slate({ wedge, clipId }: { wedge: Wedge; clipId: string }) {
  const { arc } = wedge
  const mid = (arc.start + arc.end) / 2
  const width = arc.end - arc.start
  const mark = layoutWatermark(width)
  return (
    <g clipPath={`url(#${clipId})`}>
      <g transform={`rotate(${mid})`}>
        <g data-testid="sticks">
          <path data-testid="stick" className="film-fill-cream" d={barsPath(stick, width / 2)} />
        </g>
        {mark && (
          <g
            data-testid="watermark"
            transform={`translate(0 ${-mark.radius}) scale(${mark.scale.toFixed(5)}) translate(${-(23.5 + markWidth / 2)} ${-(21.5 + markHeight / 2)})`}
          >
            <Mark />
          </g>
        )}
      </g>
    </g>
  )
}

// The card glyphs, black, drawn in a 10-unit box centered on the origin.
function Glyph({ kind }: { kind: CardGlyph }) {
  switch (kind) {
    case 'wheel':
      return (
        <>
          <circle r="4.2" fill="none" strokeWidth="1" />
          <circle r="0.9" stroke="none" />
          <path d="M0 -4 V4 M-4 0 H4 M-2.8 -2.8 L2.8 2.8 M2.8 -2.8 L-2.8 2.8" fill="none" strokeWidth="0.7" />
        </>
      )
    case 'film':
      return (
        <>
          <rect x="-4" y="-3.2" width="8" height="6.4" rx="0.6" fill="none" strokeWidth="1" />
          <rect x="-2.4" y="-1.8" width="4.8" height="3.6" stroke="none" />
        </>
      )
    case 'pumpkin':
      return (
        <>
          <path d="M0 -3.6 C-5 -4.2 -5.4 3.8 -1.6 4 C-0.6 4.4 0.6 4.4 1.6 4 C5.4 3.8 5 -4.2 0 -3.6 Z" stroke="none" />
          <path d="M0 -3.4 L0.6 -5 L1.8 -5" fill="none" strokeWidth="0.9" />
          <path
            d="M-2.6 -0.6 L-1.2 -1.8 L-0.2 -0.4 Z M0.2 -0.4 L1.2 -1.8 L2.6 -0.6 Z M-2.2 1.6 L-1 1 L0 1.8 L1 1 L2.2 1.6 L1 2.8 L-1 2.8 Z"
            className="card-glyph-cut"
            stroke="none"
          />
        </>
      )
    case 'tree':
      return (
        <>
          <path d="M0 -4.8 L2.6 -1.2 H1.2 L3.4 1.8 H1.4 L3.8 4 H-3.8 L-1.4 1.8 H-3.4 L-1.2 -1.2 H-2.6 Z" stroke="none" />
          <rect x="-0.7" y="4" width="1.4" height="1" stroke="none" />
        </>
      )
    case 'heart':
      return (
        <path
          d="M0 4.4 C-6 0.6 -4.4 -4.2 -1.8 -3.6 C-0.8 -3.4 0 -2.4 0 -1.6 C0 -2.4 0.8 -3.4 1.8 -3.6 C4.4 -4.2 6 0.6 0 4.4 Z"
          stroke="none"
        />
      )
    case 'claw':
      return (
        <>
          <path d="M-3.6 4.4 C-4.6 0.8 -3.4 -2.4 -1.2 -4.6 C-1.8 -1.8 -1.6 0.6 -0.6 2.6 Z" stroke="none" />
          <path d="M-0.8 4.6 C-1.4 0.6 -0.4 -2.8 1.6 -5 C1.4 -2 1.6 0.6 2.2 2.8 Z" stroke="none" />
          <path d="M2 4.6 C1.6 1.4 2.8 -1.6 4.8 -3.4 C4 -0.8 3.8 1.2 3.8 3.2 Z" stroke="none" />
        </>
      )
  }
}

// The wildcard wheel's film grain and vignette over the face of the disc, clipped to it (never the
// stage's box). The grain is a noise filter on a still rectangle that CSS steps about, so no script
// runs per frame and reduced motion only has to stop the animation.
function Negative({ uid }: { uid: string }) {
  return (
    <g data-testid="negative-face" clipPath={`url(#${uid}-disc)`} pointerEvents="none">
      <defs>
        <clipPath id={`${uid}-disc`}>
          <circle r={radius} />
        </clipPath>
        <filter id={`${uid}-grain`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="7" stitchTiles="stitch" />
          <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.4 0.95" />
        </filter>
        <radialGradient id={`${uid}-vignette`} cx="0" cy="0" r={radius} gradientUnits="userSpaceOnUse">
          <stop offset="0.6" stopColor="#000000" stopOpacity="0" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.26" />
        </radialGradient>
      </defs>
      <g className="wheel-grain" data-testid="grain">
        <rect x="-140" y="-140" width="280" height="280" filter={`url(#${uid}-grain)`} opacity="0.16" />
      </g>
      <circle r={radius} fill={`url(#${uid}-vignette)`} data-testid="vignette" />
    </g>
  )
}

function WedgeShape({
  wedge,
  id,
  uid,
  showLabels,
}: {
  wedge: Wedge
  id: string
  uid: string
  showLabels: boolean
}) {
  const { arc, slice, nomination } = wedge
  const mid = (arc.start + arc.end) / 2
  const width = arc.end - arc.start
  const half = (width / 2) * (Math.PI / 180)
  const imageWidth = Math.max(10, 2 * radius * Math.sin(half))
  const isWildcard = slice.kind === 'wildcard'
  const isCard = slice.kind === 'card'
  const gradient = gradientId(uid, wedge.color)
  const cardLabel = isCard ? layoutCardLabel(wedge.cardLabel ?? '', width) : null
  const label = isCard
    ? null
    : isWildcard || !showLabels
      ? null
      : layoutLabel(wedge.viewerName ?? '', nomination?.title ?? null, width)
  const word = isWildcard ? layoutWildcard(width) : null

  return (
    <g data-testid="wedge" data-kind={slice.kind}>
      <clipPath id={`${uid}-clip-${id}`}>
        <path d={wedgePath(wedge)} />
      </clipPath>
      {isWildcard ? (
        <>
          <path
            d={wedgePath(wedge)}
            className="film-fill-stock"
            stroke="#000000"
            strokeOpacity="0.4"
            strokeWidth="0.5"
          />
          <Slate wedge={wedge} clipId={`${uid}-clip-${id}`} />
        </>
      ) : isCard ? (
        // The negative: a wheel card is film cream, a movie card steel-light, each with a thin black edge.
        <path
          d={wedgePath(wedge)}
          data-card-type={wedge.cardType}
          className={wedge.cardType === 'movie' ? 'card-fill-movie' : 'card-fill-wheel'}
          stroke="#000000"
          strokeWidth="0.5"
        />
      ) : (
        <path d={wedgePath(wedge)} fill={`url(#${gradient})`} stroke="#000000" strokeOpacity="0.4" strokeWidth="0.5" />
      )}
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
      {label && (
        <g transform={`rotate(${mid - 90})`} className="wedge-text">
          <rect
            data-testid="label-tag"
            className="film-fill-stock"
            x={label.tag.x}
            y={label.tag.y}
            width={label.tag.width}
            height={label.tag.height}
            rx="0.8"
          />
          <text
            className="wheel-label"
            x={label.name.x}
            y={label.name.y}
            textAnchor="end"
            fontSize={label.name.size}
            fill="#ffffff"
          >
            {label.name.text}
          </text>
          {label.title && (
            <text
              className="wheel-label wheel-label-title"
              x={label.title.x}
              y={label.title.y}
              textAnchor="end"
              fontSize={label.title.size}
            >
              {label.title.text}
            </text>
          )}
        </g>
      )}
      {cardLabel && (
        <g transform={`rotate(${mid - 90})`} className="wedge-text">
          <text
            data-testid="card-label"
            className="wheel-label wheel-label-card"
            x={cardLabel.text.x}
            y={cardLabel.text.y}
            textAnchor="end"
            fontSize={cardLabel.text.size}
          >
            {cardLabel.text.text}
          </text>
          <g
            data-testid="card-glyph"
            data-glyph={wedge.cardGlyph}
            className="card-glyph"
            transform={`translate(${cardLabel.glyph.x} ${cardLabel.glyph.y}) scale(${cardLabel.glyph.size / 10})`}
          >
            <Glyph kind={wedge.cardGlyph ?? 'film'} />
          </g>
        </g>
      )}
      {word && (
        <g transform={`rotate(${mid - 90})`} className="wedge-text">
          <text data-testid="wildcard-word" className="wheel-label wheel-label-word" x={word.x} y={word.y} textAnchor="end" fontSize={word.size}>
            {word.text}
          </text>
        </g>
      )}
    </g>
  )
}

// The wheel under a Blind Spin: the other side of a film reel, a grey disc of six spokes round
// six windows onto the black film. It turns with the wheel, over the wedges.
const spokeHalf = 4.5
const windowInner = 34
const windowOuter = 85
const windowRound = 4

function windowPath(center: number): string {
  // Each corner pulled in by the corner's rounding, which a round-joined stroke gives back.
  const edge = (r: number) => 30 - (Math.asin((spokeHalf + windowRound) / r) * 180) / Math.PI
  const inner = windowInner + windowRound
  const outer = windowOuter - windowRound
  const a0 = center - edge(inner)
  const a1 = center + edge(inner)
  const b0 = center - edge(outer)
  const b1 = center + edge(outer)
  return `M ${point(a0, inner)} L ${point(b0, outer)} A ${outer} ${outer} 0 0 1 ${point(b1, outer)} L ${point(a1, inner)} A ${inner} ${inner} 0 0 0 ${point(a0, inner)} Z`
}

function ReelBack({ hidden }: { hidden: boolean }) {
  return (
    <g data-testid="reel-back" className="reel-back" data-hidden={hidden ? 'true' : undefined} pointerEvents="none">
      <circle r={radius} fill={blindColor} />
      <circle r={radius - 2} fill="none" className="reel-back-lip" strokeWidth="1" />
      <circle r={windowInner - 2} fill="none" className="reel-back-lip" strokeWidth="1" />
      {[0, 60, 120, 180, 240, 300].map((angle) => (
        <path key={angle} d={windowPath(angle + 30)} className="reel-back-window" strokeWidth={windowRound * 2} strokeLinejoin="round" />
      ))}
      {[0, 60, 120, 180, 240, 300].map((angle) =>
        [52, 64, 76].map((r) => (
          <path
            key={`${angle}-${r}`}
            d={`M ${point(angle + 30 - 22, r)} A ${r} ${r} 0 0 1 ${point(angle + 30 + 22, r)}`}
            className="reel-back-wind"
            fill="none"
            strokeWidth="0.4"
          />
        )),
      )}
    </g>
  )
}

interface Props {
  wedges: Wedge[]
  // Draw the back of a film reel over the wedges (a Blind Spin's wheel).
  blind?: boolean
  // False leaves the viewers' names and titles off; a wildcard's word stays.
  showLabels?: boolean
  // The wildcard wheel's negative look: grain and a vignette over the face.
  negative?: boolean
  // The rotating group; its transform is written by the wheel's motion loop.
  groupRef: Ref<SVGGElement>
  // The flapper's group, turned about the pivot by the same loop.
  flapperRef?: Ref<SVGGElement>
}

export default function Wheel({ wedges, showLabels = true, blind = false, negative = false, groupRef, flapperRef }: Props) {
  const uid = useId().replace(/:/g, '')
  // Once the wheel has been blind its reel back stays mounted, so it can dissolve away.
  const [wasBlind, setWasBlind] = useState(false)
  if (blind && !wasBlind) setWasBlind(true)
  if (wedges.length === 0) {
    return (
      <div className="wheel-empty">
        <p>Tick or add viewers to put them on the wheel.</p>
      </div>
    )
  }
  const colors = [...new Set(wedges.filter((w) => w.slice.kind === 'nomination').map((w) => w.color))]
  return (
    <svg viewBox="-124 -124 248 248" className="wheel" role="img" aria-label="Wheel">
      <Defs uid={uid} colors={colors} />
      <g ref={groupRef}>
        {wedges.map((wedge, i) => (
          <WedgeShape key={i} wedge={wedge} id={String(i)} uid={uid} showLabels={showLabels} />
        ))}
        {(blind || wasBlind) && <ReelBack hidden={!blind} />}
        <Reel wedges={wedges} />
      </g>
      {negative && <Negative uid={uid} />}
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
