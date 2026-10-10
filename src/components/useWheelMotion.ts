import { useEffect, useLayoutEffect, useRef } from 'react'
import {
  driftDegreesPerSecond,
  driftSpeedStep,
  maxFrameSeconds,
  type SpinPath,
} from '../wheel/motion.ts'
import {
  flapperStep,
  isSettled,
  nextDirection,
  pivotY,
  targetBend,
  type Direction,
  type Flapper,
} from '../wheel/pins.ts'
import { prefersReducedMotion, watchReducedMotion } from '../wheel/reducedMotion.ts'

// One requestAnimationFrame loop for the wheel's whole life: it drifts the
// wheel while idle and plays a spin path, and writes the angle straight to the
// rotating group's and the hub's `transform`, so React never re-renders per frame.
// The same loop bends the pointer's flapper as the wheel's pins (`pins`, the
// angles on the wedges on screen) pass it, and writes its `transform` too.
// `stopped` (a spin, the reveal or Night over is up) eases the drift to a halt.
export function useWheelMotion(stopped: boolean, pins: number[]) {
  const groupRef = useRef<SVGGElement>(null)
  // The Spin button's reel hub turns with the wheel, from this same loop.
  const hubRef = useRef<SVGGElement>(null)
  const flapperRef = useRef<SVGGElement>(null)
  const pinsRef = useRef(pins)
  const angle = useRef(0)
  // The flapper's state, the direction the wheel last moved (forward at first)
  // and the angle the last frame saw.
  const flapper = useRef<Flapper>({ angle: 0, velocity: 0 })
  const direction = useRef<Direction>(1)
  const lastAngle = useRef(0)
  const speed = useRef(0)
  const reduced = useRef(false)
  const stoppedRef = useRef(stopped)
  const playing = useRef<{
    path: SpinPath
    began: number | null
    done: () => void
  } | null>(null)

  function write() {
    const transform = `rotate(${angle.current})`
    groupRef.current?.setAttribute('transform', transform)
    hubRef.current?.setAttribute('transform', transform)
    flapperRef.current?.setAttribute('transform', `rotate(${flapper.current.angle} 0 ${pivotY})`)
  }

  // A wheel that mounts again (empty, then with viewers) shows the angle at once.
  useLayoutEffect(() => {
    stoppedRef.current = stopped
    pinsRef.current = pins
    write()
  })

  useEffect(() => {
    reduced.current = prefersReducedMotion()
    const unwatch = watchReducedMotion((now) => {
      reduced.current = now
      if (now) speed.current = 0
    })
    // Bends or releases the flapper for this frame's pins and direction, and
    // writes it only when it moved.
    function moveFlapper(dt: number) {
      const from = lastAngle.current
      direction.current = nextDirection(direction.current, angle.current - from)
      lastAngle.current = angle.current
      const bend = targetBend(pinsRef.current, from, angle.current, direction.current)
      const before = flapper.current.angle
      const next = flapperStep(flapper.current, bend, dt)
      flapper.current = bend === 0 && isSettled(next) ? { angle: 0, velocity: 0 } : next
      if (flapper.current.angle !== before) write()
    }

    let last: number | null = null
    let frame = requestAnimationFrame(function step(now) {
      const dt = last === null ? 0 : Math.min((now - last) / 1000, maxFrameSeconds)
      last = now
      const run = playing.current
      if (run) {
        run.began ??= now
        const elapsed = now - run.began
        if (elapsed >= run.path.durationMs) {
          playing.current = null
          angle.current = run.path.rotationAt(run.path.durationMs)
          write()
          run.done()
        } else {
          angle.current = run.path.rotationAt(elapsed)
          write()
        }
      } else {
        const target = stoppedRef.current || reduced.current ? 0 : driftDegreesPerSecond
        speed.current = reduced.current ? 0 : driftSpeedStep(speed.current, target, dt)
        if (speed.current !== 0) {
          angle.current += speed.current * dt
          write()
        }
      }
      moveFlapper(dt)
      frame = requestAnimationFrame(step)
    })
    return () => {
      cancelAnimationFrame(frame)
      unwatch()
    }
  }, [])

  return {
    groupRef,
    hubRef,
    flapperRef,
    // The angle and drift speed (degrees a second) right now.
    current: () => ({ angle: angle.current, speed: speed.current }),
    // Plays `path`, holding the drift at zero until the next idle frame after
    // `done`; `done` runs once, on the frame the path ends.
    play(path: SpinPath, done: () => void) {
      speed.current = 0
      // Held until the next render says otherwise, so no drift frame slips in
      // between the path's end and the commit that shows the reveal.
      stoppedRef.current = true
      playing.current = { path, began: null, done }
    },
  }
}
