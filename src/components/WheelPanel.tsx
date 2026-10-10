import { useEffect, useRef, useState, type Ref } from 'react'
import { createPortal } from 'react-dom'
import { viewersOnWheel, type Nomination, type Outcome } from '../state/model.ts'
import type { TmdbClient } from '../tmdb/client.ts'
import { useApp } from '../state/store.ts'
import { cryptoRandom, drawSlice, restRotation } from '../wheel/draw.ts'
import { buildWedges, type Wedge } from '../wheel/wedges.ts'
import { spinPlan } from '../wheel/edit.ts'
import { buildReducedSpinPath, buildSpinPath, spinPhases } from '../wheel/motion.ts'
import { prefersReducedMotion } from '../wheel/reducedMotion.ts'
import NightOver from './NightOver.tsx'
import Reveal from './Reveal.tsx'
import Wheel from './Wheel.tsx'
import { useWheelMotion } from './useWheelMotion.ts'

// The reel's hub: a steel disc with three windows that turns with the wheel, drawn
// behind the upright SPIN label.
function Hub({ hubRef }: { hubRef: Ref<SVGGElement> }) {
  return (
    <svg viewBox="-50 -50 100 100" className="hub" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="hub-steel" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" className="hub-steel-light" />
          <stop offset="0.6" className="hub-steel" />
          <stop offset="1" className="hub-steel-dark" />
        </radialGradient>
      </defs>
      <g ref={hubRef} data-testid="hub-disc">
        <circle r="49" fill="url(#hub-steel)" className="hub-rim" />
        {[0, 120, 240].map((angle) => (
          <g key={angle} transform={`rotate(${angle})`}>
            <rect x="-9" y="-44" width="18" height="21" rx="7" className="hub-window" />
            <circle cx="0" cy="-46" r="1.6" className="hub-rivet" />
          </g>
        ))}
        <circle r="4" className="hub-rivet" />
      </g>
    </svg>
  )
}

interface Spin {
  wedges: Wedge[]
  drawn: number
  // The wheel has landed: the flicker plays, and the reveal opens `revealHoldMs` later.
  landed: boolean
  revealedAt: Date | null
}

// How long the projector flicker plays on the open wheel before the reveal opens.
export const revealHoldMs = 650

interface Props {
  random?: () => number
  spinMs?: number
  client: TmdbClient
  onAuthError: () => void
  onBusyChange: (busy: boolean) => void
  // Where the "waiting for" message goes; under the wheel when there is none.
  reasonSlot?: HTMLElement | null
}

// "Ann", "Ann and Bo", "Ann, Bo, and Cy".
const nameList = new Intl.ListFormat('en-US', { style: 'long', type: 'conjunction' })

export default function WheelPanel({
  random = cryptoRandom,
  spinMs,
  client,
  onAuthError,
  onBusyChange,
  reasonSlot,
}: Props) {
  const { night, roster, settings, holdover, recordOutcome, startSpin } = useApp()
  // Fixed when Spin is pressed and dropped on Close, so the wheel, the draw
  // and the reveal agree even if the store changes meanwhile.
  const [spin, setSpin] = useState<Spin | null>(null)
  const motion = useWheelMotion(spin !== null || night.ended)
  const holdTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(holdTimer.current), [])

  const live = buildWedges(night, roster, settings.wheel)
  const onWheel = viewersOnWheel(night)
  const missing = onWheel
    .filter((id) => !night.nominations[id])
    .map((id) => roster.find((v) => v.id === id)?.name ?? '')
  const canSpin = !night.ended && onWheel.length > 0 && missing.length === 0
  const wedges = spin?.wedges ?? live
  const reason = night.ended
    ? 'The night is over.'
    : onWheel.length === 0
      ? 'Viewers are needed to spin.'
      : missing.length > 0
        ? `Waiting for ${nameList.format(missing)} to nominate.`
        : null

  function start() {
    startSpin()
    const wedges = buildWedges(night, roster, settings.wheel)
    const slices = wedges.map((w) => w.slice)
    const drawn = drawSlice(slices, random)
    const reduced = prefersReducedMotion()
    const plan = spinPlan(settings.wheel, reduced)
    const { angle: from, speed } = motion.current()
    const arcs = wedges.map((w) => w.arc)
    const to = restRotation(from, arcs, drawn, random, plan.turns)
    const path = reduced
      ? buildReducedSpinPath(from, to, spinMs ?? plan.durationMs)
      : buildSpinPath({
          from,
          driftSpeed: speed,
          to,
          phases: spinPhases(plan.durationMs, spinMs),
        })
    setSpin({ wedges, drawn, landed: false, revealedAt: null })
    onBusyChange(true)
    motion.play(path, () => {
      // With reduced motion there is no flicker, and a test-length spin opens at once.
      if (reduced || spinMs !== undefined) {
        setSpin((s) => s && { ...s, landed: !reduced, revealedAt: new Date() })
        return
      }
      setSpin((s) => s && { ...s, landed: true })
      holdTimer.current = setTimeout(
        () => setSpin((s) => s && { ...s, revealedAt: new Date() }),
        revealHoldMs,
      )
    })
  }

  function close() {
    clearTimeout(holdTimer.current)
    setSpin(null)
    onBusyChange(false)
  }

  function outcome(nomination: Nomination, result: Outcome, fromWheel: boolean) {
    recordOutcome(nomination, result, fromWheel)
    close()
  }

  return (
    <div className="wheel-panel">
      <div className="wheel-stage">
        <Wheel wedges={wedges} groupRef={motion.groupRef} />
        {wedges.length > 0 && (
          <button
            type="button"
            className="spin-button"
            onClick={start}
            disabled={!canSpin || spin !== null}
          >
            <Hub hubRef={motion.hubRef} />
            <span className="hub-label">Spin</span>
          </button>
        )}
        {spin?.landed && <div className="flicker" data-testid="flicker" aria-hidden="true" />}
      </div>
      {reason && !reasonSlot && <p>{reason}</p>}
      {reason && reasonSlot && createPortal(<p>{reason}</p>, reasonSlot)}
      {night.ended && <NightOver />}
      {spin?.revealedAt && (
        <Reveal
          wedge={spin.wedges[spin.drawn]}
          revealedAt={spin.revealedAt}
          client={client}
          heldFilm={holdover}
          onAuthError={onAuthError}
          onOutcome={outcome}
          onClose={close}
        />
      )}
    </div>
  )
}
