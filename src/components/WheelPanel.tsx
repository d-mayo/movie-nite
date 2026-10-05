import { useEffect, useRef, useState } from 'react'
import { useApp } from '../state/store.ts'
import { cryptoRandom, drawSlice, restRotation } from '../wheel/draw.ts'
import { buildWedges, type Wedge } from '../wheel/wedges.ts'
import { prefersReducedMotion } from '../wheel/reducedMotion.ts'
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
  onBusyChange: (busy: boolean) => void
}

const easeOut = (t: number) => 1 - (1 - t) ** 3

export default function WheelPanel({
  random = cryptoRandom,
  spinMs,
  onBusyChange,
}: Props) {
  const { night, roster } = useApp()
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
  const missing = night.presentIds
    .filter((id) => !night.nominations[id])
    .map((id) => roster.find((v) => v.id === id)?.name ?? '')
  const canSpin = night.presentIds.length > 0 && missing.length === 0
  const wedges = spin?.wedges ?? live
  const reason =
    night.presentIds.length === 0
      ? 'Viewers are needed to spin.'
      : missing.length > 0
        ? `Waiting for ${missing.join(', ')} to nominate.`
        : null

  function start() {
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

  return (
    <div className="wheel-panel">
      <Wheel wedges={wedges} rotation={rotation} />
      {reason && <p>{reason}</p>}
      <button type="button" onClick={start} disabled={!canSpin || spin !== null}>
        Spin
      </button>
      {spin?.revealedAt && (
        <Reveal
          wedge={spin.wedges[spin.drawn]}
          revealedAt={spin.revealedAt}
          onClose={close}
        />
      )}
    </div>
  )
}
