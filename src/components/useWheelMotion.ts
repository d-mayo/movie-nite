import { useEffect, useLayoutEffect, useRef } from 'react'
import {
  driftDegreesPerSecond,
  driftSpeedStep,
  maxFrameSeconds,
  type SpinPath,
} from '../wheel/motion.ts'
import { prefersReducedMotion, watchReducedMotion } from '../wheel/reducedMotion.ts'

// One requestAnimationFrame loop for the wheel's whole life: it drifts the
// wheel while idle and plays a spin path, and writes the angle straight to the
// rotating group's and the hub's `transform`, so React never re-renders per frame. `stopped`
// (a spin, the reveal or Night over is up) eases the drift to a halt.
export function useWheelMotion(stopped: boolean) {
  const groupRef = useRef<SVGGElement>(null)
  // The Spin button's reel hub turns with the wheel, from this same loop.
  const hubRef = useRef<SVGGElement>(null)
  const angle = useRef(0)
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
  }

  // A wheel that mounts again (empty, then with viewers) shows the angle at once.
  useLayoutEffect(() => {
    stoppedRef.current = stopped
    write()
  })

  useEffect(() => {
    reduced.current = prefersReducedMotion()
    const unwatch = watchReducedMotion((now) => {
      reduced.current = now
      if (now) speed.current = 0
    })
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
