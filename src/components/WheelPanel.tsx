import { useEffect, useRef, useState, type Ref } from 'react'
import { createPortal } from 'react-dom'
import { viewersOnWheel, type Nomination, type Outcome } from '../state/model.ts'
import type { TmdbClient } from '../tmdb/client.ts'
import { useApp } from '../state/store.ts'
import { CardChips } from './CardChips.tsx'
import {
  angleUnderPointer,
  cryptoRandom,
  drawSlice,
  drawWildcardSlice,
  restRotation,
  rotationTo,
} from '../wheel/draw.ts'
import {
  closeCallChance,
  closeCallKind,
  closeCallMinSpinSeconds,
  forcedRestRotation,
  isCloseCall,
  slipDegrees,
} from '../wheel/closeCall.ts'
import { countdownNumbers, countdownStepMs, rollsCountdown } from '../wheel/countdown.ts'
import { catchChance, forcedCatchRotation, isCatch } from '../wheel/catch.ts'
import { pinAngles, pinPastPointer, pushStart } from '../wheel/pins.ts'
import { buildCardWedges, buildWedges, type Wedge } from '../wheel/wedges.ts'
import { effectiveSetting, spinPlan, wildcardTotal } from '../wheel/edit.ts'
import type { DealContext } from '../wildcards/cards.ts'
import { canDeal, dealCards, type DealtCard } from '../wildcards/deal.ts'
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
import CardReveal from './CardReveal.tsx'
import Countdown from './Countdown.tsx'
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
  // The leader countdown's number while its dial shows, else null.
  countdown: number | null
  // Which wheel this is: the viewers' own, or the wildcard wheel of dealt cards.
  wheel: 'main' | 'cards'
  // The wildcard wheel's deal.
  deal: DealtCard[] | null
  // The wildcard wheel is up and waits for its press.
  waiting: boolean
  // The card has been taken back to the main wheel, which is fading in.
  leaving: boolean
}

// Half of a crossfade between the main wheel and the wildcard wheel: the stage fades out, the
// wheels swap, and it fades back in.
export const crossfadeMs = 150

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
  onBusyChange,
  reasonSlot,
}: Props) {
  const { night, roster, settings, holdover, recordOutcome, startSpin, addCardEffect } = useApp()
  // Fixed when Spin is pressed and dropped on Close, so the wheel, the draw
  // and the reveal agree even if the store changes meanwhile.
  const [spin, setSpin] = useState<Spin | null>(null)
  // The debug query flag, read once, and its unsaved checkbox.
  const [debug] = useState(() => new URLSearchParams(window.location.search).has('debug'))
  const [forceCloseCalls, setForceCloseCalls] = useState(false)
  const [forceCatches, setForceCatches] = useState(false)
  const [forceCountdowns, setForceCountdowns] = useState(false)
  const [forceWildcards, setForceWildcards] = useState(false)
  // The stage is faded out between the main wheel and the wildcard wheel.
  const [fading, setFading] = useState(false)
  const fadeTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const countdownTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
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
      clearTimeout(countdownTimer.current)
      clearTimeout(fadeTimer.current)
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
    // The drift runs on under a countdown's dial and eases to a stop only once the spin is under way.
    (spin !== null && !spin.waiting && spin.countdown === null) || night.ended,
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
    ? null
    : onWheel.length === 0
      ? 'Viewers are needed to spin.'
      : null
  // Who the spin waits on: a tooltip over the Spin button on wide screens, a line under the wheel on narrow ones.
  const waiting =
    !night.ended && onWheel.length > 0 && missing.length > 0
      ? `Waiting for ${nameList.format(missing)} to nominate.`
      : null

  // What the cards are dealt against: the viewers on the wheel as it is now, cards included.
  function dealContext(): DealContext {
    const ordered = roster.filter((v) => onWheel.includes(v.id))
    return {
      viewers: ordered.map((v) => ({
        id: v.id,
        name: v.name,
        ...effectiveSetting(settings.wheel, night.adjustments, v.id, night.cardEffects),
      })),
      wildcardCount: wildcardTotal(ordered.length, settings.wheel, night.cardEffects),
    }
  }

  // Fades the stage out, swaps what it shows, and fades it back in.
  function crossfade(swap: () => void) {
    setFading(true)
    clearTimeout(fadeTimer.current)
    fadeTimer.current = setTimeout(() => {
      swap()
      setFading(false)
    }, crossfadeMs)
  }

  function start() {
    // The wildcard wheel's own press spins it; it does not clear the held film again.
    const onCards = spin !== null && spin.wheel === 'cards' && spin.waiting
    if (!onCards) startSpin()
    const wedges = onCards ? spin.wedges : buildWedges(night, roster, settings.wheel)
    const slices = wedges.map((w) => w.slice)
    const drawn = (forceWildcards && !onCards ? drawWildcardSlice(slices, random) : null) ?? drawSlice(slices, random)
    // A wildcard drawn on the main wheel opens the wildcard wheel, when it is on and has a card to deal.
    const toCards =
      !onCards && slices[drawn].kind === 'wildcard' && settings.wheel.wildcardWheel && canDeal(dealContext())
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
    // A catch runs on into the start edge's pin and rocks back off it; the peak bend is drawn from 16° to 26°.
    const peakBend = caught ? 16 + random() * 10 : 0
    // The countdown is rolled last, so every other draw takes the value it would without one. A test-length
    // spin rolls none (only the debug checkbox forces one), and reduced motion has none.
    const countdown = !reduced && (forceCountdowns || (spinMs === undefined && rollsCountdown(random())))
    // The path is built from where the wheel is when the spin launches: at the press, or when the
    // countdown ends; the rest point is the one drawn here.
    function launch(from: number, speed: number, to: number, afterCountdown: boolean) {
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
              peakPast: pinPastPointer(peakBend),
              touchAt: pushStart,
            },
            scale,
          )
        : null
      const path = caughtPath?.path ?? close?.path ?? ordinary
      const cueMs = close?.cueMs ?? 0
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
        // A landing on a wildcard that opens the wildcard wheel plays no fanfare: the march plays on, brought back up after a close call.
        if (toCards) {
          if (closeCall) sound.musicResume()
        } else {
          sound.landed(holdMs / 1000, closeCall)
        }
        setSpin((s) => s && { ...s, landed: true })
        if (closeCall) {
          easeTimer.current = setTimeout(
            () => setSpin((s) => s && { ...s, zoom: 'out' }),
            holdMs - closeCallEaseOutMs,
          )
        }
        holdTimer.current = setTimeout(() => {
          if (toCards) enterCards()
          else setSpin((s) => s && { ...s, revealedAt: new Date(), zoom: null })
        }, holdMs)
      }
      motion.play(
        path,
        () => {
          if (kind === 'slip' && !immediate) return
          if (kind === 'bend') sound.closeCallBreak()
          if (immediate) {
            // With reduced motion there is no flicker, and a test-length spin opens at once.
            if (toCards) {
              if (closeCall) sound.musicResume()
              enterCards()
              return
            }
            sound.landed(0, closeCall)
            setSpin((s) => s && { ...s, landed: !reduced, revealedAt: new Date(), zoom: null })
            return
          }
          land(closeCall ? closeCallHoldMs : revealHoldMs)
        },
        cues,
        afterCountdown,
        onCards,
      )
    }

    // The wildcard wheel: the deal is made now, and the stage fades over to it.
    function enterCards() {
      const deal = dealCards(dealContext(), random)
      if (deal.length === 0) {
        setSpin((s) => s && { ...s, revealedAt: new Date(), zoom: null })
        return
      }
      crossfade(() =>
        setSpin({
          wedges: buildCardWedges(deal),
          drawn: 0,
          landed: false,
          revealedAt: null,
          closeCall: false,
          zoom: null,
          countdown: null,
          wheel: 'cards',
          deal,
          waiting: true,
          leaving: false,
        }),
      )
    }

    setSpin({
      wedges,
      drawn,
      landed: false,
      revealedAt: null,
      closeCall,
      zoom: null,
      countdown: countdown ? countdownNumbers[0] : null,
      wheel: onCards ? 'cards' : 'main',
      deal: onCards ? spin.deal : null,
      waiting: false,
      leaving: false,
    })
    onBusyChange(true)
    if (!countdown) {
      launch(from, speed, to, false)
      return
    }
    // The projector switches on at the press, but the music waits for the launch; the wheel keeps drifting.
    sound.spinStart(true, onCards)
    sound.beep()
    let step = 0
    const tick = () => {
      step++
      if (step < countdownNumbers.length) {
        const number = countdownNumbers[step]
        setSpin((s) => s && { ...s, countdown: number })
        sound.beep()
        countdownTimer.current = setTimeout(tick, countdownStepMs)
        return
      }
      setSpin((s) => s && { ...s, countdown: null })
      const now = motion.current()
      launch(now.angle, now.speed, rotationTo(now.angle, rest, plan.turns), true)
    }
    countdownTimer.current = setTimeout(tick, countdownStepMs)
  }

  function close() {
    clearTimeout(holdTimer.current)
    clearTimeout(easeTimer.current)
    if (musicOn.current) sound.revealClosed()
    musicOn.current = false
    setSpin(null)
    onBusyChange(false)
  }

  // The card's effect joins the night, the stage fades back to the main wheel, and the lock ends.
  function back() {
    const card = spin?.deal?.[spin.drawn]
    if (!card || spin.leaving) return
    addCardEffect(card.effect)
    clearTimeout(holdTimer.current)
    clearTimeout(easeTimer.current)
    if (musicOn.current) sound.revealClosed()
    musicOn.current = false
    setSpin((s) => s && { ...s, leaving: true })
    crossfade(() => {
      setSpin(null)
      onBusyChange(false)
    })
  }

  function outcome(nomination: Nomination, result: Outcome, fromWheel: boolean) {
    recordOutcome(nomination, result, fromWheel)
    close()
  }

  return (
    <div className="wheel-panel">
      <div
        className="wheel-stage"
        ref={stageRef}
        data-zoom={spin?.zoom ?? undefined}
        data-fade={fading ? 'out' : undefined}
      >
        {/* A close call's zoom scales this wrapper, not the stage, which the reveal measures and the flicker sits in. */}
        <div className="wheel-zoom">
          <Wheel wedges={wedges} showLabels={settings.wheel.showLabels} groupRef={motion.groupRef} flapperRef={motion.flapperRef} />
          {wedges.length > 0 && (
            <button
              type="button"
              className="spin-button"
              onClick={start}
              disabled={!canSpin || (spin !== null && !spin.waiting)}
              aria-describedby={waiting ? 'spin-waiting' : undefined}
            >
              <Hub hubRef={motion.hubRef} />
              <span className="hub-label">Spin</span>
            </button>
          )}
          {spin?.countdown != null && <Countdown number={spin.countdown} />}
        </div>
        <div className="zoom-vignette" ref={vignetteRef} aria-hidden="true" />
        {spin?.landed && <div className="flicker" data-testid="flicker" aria-hidden="true" />}
        {waiting && (
          <p id="spin-waiting" className="spin-waiting">
            {waiting}
          </p>
        )}
      </div>
      <CardChips />
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
      {debug && (
        <label className="debug-force">
          <input
            type="checkbox"
            checked={forceCountdowns}
            disabled={spin !== null}
            onChange={(e) => setForceCountdowns(e.target.checked)}
          />{' '}
          Force countdowns
        </label>
      )}
      {debug && (
        <label className="debug-force">
          <input
            type="checkbox"
            checked={forceWildcards}
            disabled={spin !== null}
            onChange={(e) => setForceWildcards(e.target.checked)}
          />{' '}
          Force wildcards
        </label>
      )}
      {reason && !reasonSlot && <p>{reason}</p>}
      {reason && reasonSlot && createPortal(<p>{reason}</p>, reasonSlot)}
      {night.ended && !reasonSlot && <NightOver />}
      {night.ended && reasonSlot && createPortal(<NightOver />, reasonSlot)}
      {spin?.revealedAt && spin.wheel === 'cards' && !spin.leaving && spin.deal?.[spin.drawn] && (
        <CardReveal card={spin.deal[spin.drawn]} closeCall={spin.closeCall} onBack={back} />
      )}
      {spin?.revealedAt && spin.wheel === 'main' && (
        <Reveal
          wedge={spin.wedges[spin.drawn]}
          revealedAt={spin.revealedAt}
          client={client}
          heldFilm={holdover}
          closeCall={spin.closeCall}
          onOutcome={outcome}
          onClose={close}
        />
      )}
    </div>
  )
}
