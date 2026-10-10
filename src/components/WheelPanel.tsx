import { useState } from 'react'
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

interface Spin {
  wedges: Wedge[]
  drawn: number
  revealedAt: Date | null
}

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
    setSpin({ wedges, drawn, revealedAt: null })
    onBusyChange(true)
    motion.play(path, () => setSpin((s) => s && { ...s, revealedAt: new Date() }))
  }

  function close() {
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
            Spin
          </button>
        )}
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
