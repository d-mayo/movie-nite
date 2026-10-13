import { useEffect, useRef, useState, type Ref } from 'react'
import { createPortal } from 'react-dom'
import { viewersOnWheel, type Nomination, type Outcome } from '../state/model.ts'
import type { TmdbClient } from '../tmdb/client.ts'
import { useApp } from '../state/store.ts'
import { angleUnderPointer, cryptoRandom, drawSlice, restRotation } from '../wheel/draw.ts'
import {
  closeCallChance,
  closeCallKind,
  closeCallMinSpinSeconds,
  forcedRestRotation,
  isCloseCall,
  slipDegrees,
} from '../wheel/closeCall.ts'
import { catchChance, forcedCatchRotation, isCatch } from '../wheel/catch.ts'
import { pinAngles, pinPastPointer, pushStart } from '../wheel/pins.ts'
import { buildWedges, type Wedge } from '../wheel/wedges.ts'
import { spinPlan } from '../wheel/edit.ts'
import {
  buildCatchPath,
  buildCloseCallPath,
  buildReducedSpinPath,
  buildSpinPath,
  closeCallEaseOutMs,
  closeCallHoldMs,
  spinPhases,
  timeAtRotation,
  windUpMs,
} from '../wheel/motion.ts'
import { prefersReducedMotion } from '../wheel/reducedMotion.ts'
import { silentSound, type SoundEngine } from '../sound/engine.ts'
import NightOver from './NightOver.tsx'
import Reveal from './Reveal.tsx'
import Wheel from './Wheel.tsx'
import { useWheelMotion, type Cue } from './useWheelMotion.ts'

// The reel's hub: a steel disc with three rounded windows and rivets that turns with the
// wheel, drawn behind the upright SPIN label.
function Hub({ hubRef }: { hubRef: Ref<SVGGElement> }) {
  return (
    <svg viewBox="-25 -25 50 50" className="hub" aria-hidden="true" focusable="false">
      <g ref={hubRef} data-testid="hub-disc">
        <circle r="24.2" className="hub-disc" />
        {[0, 120, 240].map((angle) => (
          <rect key={angle} x="-3.6" y="-22.2" width="7.2" height="7.2" rx="1.8" className="hub-window" transform={`rotate(${angle})`} />
        ))}
        {[60, 120, 180, 240, 300, 360].map((angle) => (
          <circle
            key={angle}
            cx={(21 * Math.sin((angle * Math.PI) / 180)).toFixed(2)}
            cy={(-21 * Math.cos((angle * Math.PI) / 180)).toFixed(2)}
            r="0.9"
            className="hub-rivet"
          />
        ))}
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
  // The rest point was a close call, decided at the press.
  closeCall: boolean
  // The close call's zoom on the pointer: in from the cue through the hold, out while it eases back.
  zoom: 'in' | 'out' | null
}

// How long the projector flicker plays on the open wheel before the reveal opens.
export const revealHoldMs = 650

// The pointer's height as a share of the wheel's width, which is the zoom's origin (8.5% down the wheel).
const pointerShare = 0.085
// How hard the catch's tick sounds, as a share of the spin's top speed: the wheel is slow there.
export const catchTickShare = 0.2
// After an early landing (a slip), the reveal waits at least this long after the wheel stops creeping.
const slipSettleMs = 600

interface Props {
  random?: () => number
  spinMs?: number
  sound?: SoundEngine
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
  sound = silentSound,
  client,
  onAuthError,
  onBusyChange,
  reasonSlot,
}: Props) {
  const { night, roster, settings, holdover, recordOutcome, startSpin } = useApp()
  // Fixed when Spin is pressed and dropped on Close, so the wheel, the draw
  // and the reveal agree even if the store changes meanwhile.
  const [spin, setSpin] = useState<Spin | null>(null)
  // The debug query flag, read once, and its unsaved checkbox.
  const [debug] = useState(() => new URLSearchParams(window.location.search).has('debug'))
  const [forceCloseCalls, setForceCloseCalls] = useState(false)
  const [forceCatches, setForceCatches] = useState(false)
  const holdTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const vignetteRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const easeTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  // Whether the music is playing: from the press until the reveal closes.
  const musicOn = useRef(false)
  const soundRef = useRef(sound)
  useEffect(() => {
    soundRef.current = sound
  }, [sound])
  useEffect(
    () => () => {
      clearTimeout(holdTimer.current)
      clearTimeout(easeTimer.current)
      // Unmounted with the reveal open (a cleared token): the music still fades.
      if (musicOn.current) soundRef.current.revealClosed()
    },
    [],
  )

  const live = buildWedges(night, roster, settings.wheel)
  const onWheel = viewersOnWheel(night)
  const missing = onWheel
    .filter((id) => !night.nominations[id])
    .map((id) => roster.find((v) => v.id === id)?.name ?? '')
  const canSpin = !night.ended && onWheel.length > 0 && missing.length === 0
  const wedges = spin?.wedges ?? live
  const motion = useWheelMotion(
    spin !== null || night.ended,
    pinAngles(wedges.map((w) => w.arc)),
    sound,
    {
      music: settings.wheel.soundMusic,
      effects: settings.wheel.soundEffects,
      volume: settings.wheel.soundVolume,
      muted: settings.wheel.soundMuted,
    },
  )
  const closeCallsAvailable = settings.wheel.spinSeconds >= closeCallMinSpinSeconds
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
    const natural = restRotation(from, arcs, drawn, random, plan.turns)
    // A share of spins (all of them with the debug checkbox) rest in a close-call zone of the
    // drawn slice, when it has one: the winner is the same, only where in the slice it stops.
    // Close calls need a long enough spin: a shorter one is still turning when the zoom would begin.
    const closeCallsOn = settings.wheel.spinSeconds >= closeCallMinSpinSeconds
    const steer =
      closeCallsOn &&
      (forceCloseCalls || (!isCloseCall(slices, arcs, drawn, angleUnderPointer(natural)) && random() < closeCallChance))
    const forced = steer ? forcedRestRotation(from, slices, arcs, drawn, random, plan.turns) : null
    const afterClose = forced ?? natural
    const kind = closeCallsOn ? closeCallKind(slices, arcs, drawn, angleUnderPointer(afterClose)) : null
    const closeCall = kind !== null
    // A spin that is not a close call is steered into a catch zone of the drawn slice (a third of
    // them, or every one with the debug checkbox), unless it already rests in one. Not with reduced
    // motion, which has no rock.
    const catchSteer =
      !closeCall &&
      !reduced &&
      (forceCatches || (!isCatch(slices, arcs, drawn, angleUnderPointer(afterClose)) && random() < catchChance))
    const to = (catchSteer && forcedCatchRotation(from, slices, arcs, drawn, random, plan.turns)) || afterClose
    const rest = angleUnderPointer(to)
    const caught = !closeCall && !reduced && isCatch(slices, arcs, drawn, rest)
    const ordinary = reduced
      ? buildReducedSpinPath(from, to, spinMs ?? plan.durationMs)
      : buildSpinPath({ from, driftSpeed: speed, to, phases: spinPhases(plan.durationMs, spinMs) })
    // A close call hands the glide's approach over to a longer, creeping one (not with reduced
    // motion, which keeps its 1 s path); a test-length spin shortens it in proportion.
    const close =
      closeCall && !reduced
        ? buildCloseCallPath(ordinary, to, spinMs === undefined ? 1 : spinMs / (windUpMs + plan.durationMs))
        : null
    // A catch runs on into the start edge's pin and rocks back off it; the peak bend is drawn from 16° to 26°.
    const scale = spinMs === undefined ? 1 : spinMs / (windUpMs + plan.durationMs)
    const caughtPath = caught
      ? buildCatchPath(
          {
            from,
            driftSpeed: speed,
            to,
            phases: spinPhases(plan.durationMs, spinMs),
            restGap: rest - arcs[drawn].start,
            peakPast: pinPastPointer(16 + random() * 10),
            touchAt: pushStart,
          },
          scale,
        )
      : null
    const path = caughtPath?.path ?? close?.path ?? ordinary
    const cueMs = close?.cueMs ?? 0
    setSpin({ wedges, drawn, landed: false, revealedAt: null, closeCall, zoom: null })
    onBusyChange(true)
    musicOn.current = true
    // The reveal opens at once with reduced motion or a test-length spin.
    const immediate = reduced || spinMs !== undefined
    // The cue: the zoom and the sounds, where the approach begins (at the start with reduced motion).
    const cues: Cue[] = []
    if (closeCall) {
      cues.push({
        atMs: cueMs,
        fire: () => {
          sound.closeCall((path.durationMs - cueMs) / 1000)
          if (!reduced) {
            // The zoom is about the pointer: the vignette closes in round that spot of the screen.
            const rect = stageRef.current?.getBoundingClientRect()
            if (rect) {
              vignetteRef.current?.style.setProperty('--pointer-x', `${rect.left + rect.width / 2}px`)
              vignetteRef.current?.style.setProperty('--pointer-y', `${rect.top + rect.width * pointerShare}px`)
            }
            setSpin((s) => s && { ...s, zoom: 'in' })
          }
        },
      })
      // A slip releases the tension where the flapper slips off the peg, before the stop, and the
      // landing (the flash, the fanfare, and the clock to the reveal) starts right behind it, while the
      // wheel finishes creeping; a bend releases it at the stop. With reduced motion or a test-length
      // spin the reveal opens at once, so the landing waits for the stop.
      if (kind === 'slip') {
        const slipMs = timeAtRotation(path, to - slipDegrees(arcs[drawn], rest), cueMs)
        cues.push({
          atMs: slipMs,
          fire: () => {
            sound.closeCallBreak()
            if (!immediate) land(Math.max(closeCallHoldMs, path.durationMs - slipMs + slipSettleMs))
          },
        })
      }
    }
    // A catch's one tick, as the pin first meets the tongue; no pin slips off in a catch, so it has no other.
    if (caughtPath) cues.push({ atMs: caughtPath.contactMs, fire: () => sound.pinTick(catchTickShare) })
    // The landing: the stinger's hit and the reveal after `holdMs`; a close call holds its zoom, then
    // eases it back (the hold's last part) before the reveal opens.
    function land(holdMs: number) {
      sound.landed(holdMs / 1000, closeCall)
      setSpin((s) => s && { ...s, landed: true })
      if (closeCall) {
        easeTimer.current = setTimeout(
          () => setSpin((s) => s && { ...s, zoom: 'out' }),
          holdMs - closeCallEaseOutMs,
        )
      }
      holdTimer.current = setTimeout(
        () => setSpin((s) => s && { ...s, revealedAt: new Date(), zoom: null }),
        holdMs,
      )
    }
    motion.play(
      path,
      () => {
        if (kind === 'slip' && !immediate) return
        if (kind === 'bend') sound.closeCallBreak()
        if (immediate) {
          sound.landed(0, closeCall)
          // With reduced motion there is no flicker, and a test-length spin opens at once.
          setSpin((s) => s && { ...s, landed: !reduced, revealedAt: new Date(), zoom: null })
          return
        }
        land(closeCall ? closeCallHoldMs : revealHoldMs)
      },
      cues,
    )
  }

  function close() {
    clearTimeout(holdTimer.current)
    clearTimeout(easeTimer.current)
    if (musicOn.current) sound.revealClosed()
    musicOn.current = false
    setSpin(null)
    onBusyChange(false)
  }

  function outcome(nomination: Nomination, result: Outcome, fromWheel: boolean) {
    recordOutcome(nomination, result, fromWheel)
    close()
  }

  return (
    <div className="wheel-panel">
      <div className="wheel-stage" ref={stageRef} data-zoom={spin?.zoom ?? undefined}>
        {/* A close call's zoom scales this wrapper, not the stage, which the reveal measures and the flicker sits in. */}
        <div className="wheel-zoom">
          <Wheel wedges={wedges} showLabels={settings.wheel.showLabels} groupRef={motion.groupRef} flapperRef={motion.flapperRef} />
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
        </div>
        <div className="zoom-vignette" ref={vignetteRef} aria-hidden="true" />
        {spin?.landed && <div className="flicker" data-testid="flicker" aria-hidden="true" />}
      </div>
      {debug && (
        <label className="debug-force">
          <input
            type="checkbox"
            checked={forceCloseCalls}
            disabled={spin !== null || !closeCallsAvailable}
            onChange={(e) => setForceCloseCalls(e.target.checked)}
          />{' '}
          Force close calls
          {!closeCallsAvailable && ` (needs a spin Length of ${closeCallMinSpinSeconds} s or more)`}
        </label>
      )}
      {debug && (
        <label className="debug-force">
          <input
            type="checkbox"
            checked={forceCatches}
            disabled={spin !== null}
            onChange={(e) => setForceCatches(e.target.checked)}
          />{' '}
          Force catches
        </label>
      )}
      {reason && !reasonSlot && <p>{reason}</p>}
      {reason && reasonSlot && createPortal(<p>{reason}</p>, reasonSlot)}
      {night.ended && <NightOver />}
      {spin?.revealedAt && (
        <Reveal
          wedge={spin.wedges[spin.drawn]}
          revealedAt={spin.revealedAt}
          client={client}
          heldFilm={holdover}
          closeCall={spin.closeCall}
          onAuthError={onAuthError}
          onOutcome={outcome}
          onClose={close}
        />
      )}
    </div>
  )
}
