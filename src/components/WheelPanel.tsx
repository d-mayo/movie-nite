import { useEffect, useRef, useState } from 'react'
import { viewersOnWheel, type Nomination, type Outcome } from '../state/model.ts'
import type { TmdbClient } from '../tmdb/client.ts'
import { useApp } from '../state/store.ts'
import { cryptoRandom, drawSlice, restRotation } from '../wheel/draw.ts'
import { buildWedges, type Wedge } from '../wheel/wedges.ts'
import { prefersReducedMotion } from '../wheel/reducedMotion.ts'
import NightOver from './NightOver.tsx'
import Reveal from './Reveal.tsx'
import Wheel from './Wheel.tsx'

const defaultSpinMs = 6000
const reducedSpinMs = 1000
const fullTurns = 5

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
}

const easeOut = (t: number) => 1 - (1 - t) ** 3

export default function WheelPanel({
  random = cryptoRandom,
  spinMs,
  client,
  onAuthError,
  onBusyChange,
}: Props) {
  const { night, roster, recordOutcome, startSpin } = useApp()
  const [rotation, setRotation] = useState(0)
  // Fixed when Spin is pressed and dropped on Close, so the wheel, the draw
  // and the reveal agree even if the store changes meanwhile.
  const [spin, setSpin] = useState<Spin | null>(null)
  const frame = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
    },
    [],
  )

  const live = buildWedges(night, roster)
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
        ? `Waiting for ${missing.join(', ')} to nominate.`
        : null

  function start() {
    startSpin()
    const wedges = buildWedges(night, roster)
    const slices = wedges.map((w) => w.slice)
    const drawn = drawSlice(slices, random)
    const reduced = prefersReducedMotion()
    const duration = reduced ? reducedSpinMs : (spinMs ?? defaultSpinMs)
    const from = rotation
    const to = restRotation(
      from,
      wedges.map((w) => w.arc),
      drawn,
      random,
      reduced ? 1 : fullTurns,
    )
    setSpin({ wedges, drawn, revealedAt: null })
    onBusyChange(true)
    let began: number | null = null
    const step = (now: number) => {
      began ??= now
      const t = Math.min(1, (now - began) / duration)
      setRotation(from + (to - from) * easeOut(t))
      if (t < 1) {
        frame.current = requestAnimationFrame(step)
      } else {
        frame.current = null
        setSpin((s) => s && { ...s, revealedAt: new Date() })
      }
    }
    frame.current = requestAnimationFrame(step)
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
        <Wheel wedges={wedges} rotation={rotation} />
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
      {reason && <p>{reason}</p>}
      {night.ended && <NightOver />}
      {spin?.revealedAt && (
        <Reveal
          wedge={spin.wedges[spin.drawn]}
          revealedAt={spin.revealedAt}
          client={client}
          onAuthError={onAuthError}
          onOutcome={outcome}
          onClose={close}
        />
      )}
    </div>
  )
}
