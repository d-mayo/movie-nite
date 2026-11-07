import { useEffect, useState, type CSSProperties } from 'react'
import type { SeasonId } from '../seasons/seasons.ts'
import { prefersReducedMotion, watchReducedMotion } from '../wheel/reducedMotion.ts'

export const snowflakeCount = 40

interface Flake {
  x: number
  size: number
  duration: number
  delay: number
  sway: number
  opacity: number
}

// Each flake's place, size and timing, chosen once; CSS keyframes move it.
function makeFlakes(random: () => number): Flake[] {
  return Array.from({ length: snowflakeCount }, () => {
    const duration = 12 + random() * 14
    return {
      x: random() * 100,
      size: 4 + random() * 6,
      duration,
      // Negative, so the snow is already falling when the layer appears.
      delay: -random() * duration,
      sway: (random() - 0.5) * 60,
      opacity: 0.55 + random() * 0.4,
    }
  })
}

function Snow({ random }: { random: () => number }) {
  const [flakes] = useState(() => makeFlakes(random))
  return (
    <div className="seasonal-effects" aria-hidden="true">
      {flakes.map((flake, i) => (
        <span
          key={i}
          className="snowflake"
          style={
            {
              '--x': `${flake.x.toFixed(2)}%`,
              '--size': `${flake.size.toFixed(2)}px`,
              '--duration': `${flake.duration.toFixed(2)}s`,
              '--delay': `${flake.delay.toFixed(2)}s`,
              '--sway': `${flake.sway.toFixed(1)}px`,
              '--flake-opacity': flake.opacity.toFixed(2),
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}

// The screen effect of the active theme: snow for Christmas, nothing for any other theme or
// while the visitor prefers reduced motion.
export default function SeasonalEffects({ season, random }: { season: SeasonId | null; random: () => number }) {
  const [reduced, setReduced] = useState(prefersReducedMotion)
  useEffect(() => watchReducedMotion(setReduced), [])
  if (season !== 'christmas' || reduced) return null
  return <Snow random={random} />
}
