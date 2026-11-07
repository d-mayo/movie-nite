// The sound engine: one Web Audio context behind the wheel's spin, as plain
// TypeScript with no React. The context and the files are made on the first
// user gesture anywhere in the document (browsers keep audio locked until
// then); until then, and wherever Web Audio is missing (jsdom), every call does
// nothing. The graph is sources → effects bus (or music bus) → master gain →
// destination, and the settings drive the three gains. The music loop, the win
// stinger and the applause all ride the music bus.

import type { SeasonId } from '../seasons/seasons.ts'
import { marchSet, setFiles, soundSets, type BellsPart, type LoopPart, type SoundSets, type StingerPart } from './seasons.ts'

export type SoundName =
  | 'on'
  | 'hum'
  | 'off'
  | 'loop'
  | 'stinger'
  | 'applause'
  | 'gasp'
  | 'drumroll'
  | 'cymbal'
  | 'cheer'
  | 'dloop'
  | 'ambience'
  | 'runout'
  | 'clunk'
  | 'clap'
  | 'knock'
  | 'christmas-loop'
  | 'christmas-stinger'
  | 'christmas-win-1'
  | 'christmas-win-2'
  | 'christmas-win-3'
  | 'christmas-win-4'
  | 'christmas-bells'

export interface SoundSettings {
  // 0 to 100 each: the overall volume, and the music's and the effects' levels,
  // which can't pass it; muted silences everything and keeps the levels.
  music: number
  effects: number
  volume: number
  muted: boolean
}

export interface SoundEngine {
  // Listens for the first gestures on `target`; the returned function stops.
  attach(target: EventTarget): () => void
  apply(settings: SoundSettings): void
  // The season whose soundtrack plays (null for the march). A season's files are fetched only while it is set.
  setSeason(season: SeasonId | null): void
  // Spin pressed: the projector switches on and its motor starts, and the music loop starts, unless
  // `countdown` says a leader countdown comes first, when the music waits for musicStart.
  // On the wildcard wheel (`cards`) the ambience plays on and no loop starts.
  spinStart(countdown?: boolean, cards?: boolean): void
  // Brings a loop a close call silenced back to its full level, with no stinger.
  musicResume(): void
  // The leader countdown ended: the music loop starts, as at an ordinary press.
  musicStart(): void
  // One leader beep, at the start of each number of the countdown.
  beep(): void
  // A wildcard landing that opens the wildcard wheel: the reel runs out in place of the win sounds, and the
  // march gives way to its distorted twin, from where it has reached.
  wildcardLanded(): void
  // The cue marks begin: the loop winds down like a dying reel, slowing and fading, and stops.
  reelCut(): void
  // One beep with each blink of the cue mark, pitched apart from the leader beep.
  cueBeep(): void
  // The wheels swap: the reel clunks and the ambience starts looping (one already playing is left as it is).
  reelChange(): void
  // The wildcard wheel's spin landed and its win sounds wait for the result: the loop settles to its
  // bed (after a close call, back up from silence) and a close call's cheer plays.
  landedQuiet(closeCall?: boolean): void
  // The stinger (its hit `revealInSeconds` from now) and the applause alone, the loop dipping under them.
  fanfare(revealInSeconds: number): void
  // A film can opened.
  knock(): void
  // Leaving the wildcard wheel: a clap ends the ambience and any win sounds, and silence follows its reverb.
  slam(): void
  // The wheel's speed as a share (0 to 1) of the spin's peak, and the seconds
  // until it stops: the hum follows both.
  spinSpeed(share: number, secondsLeft: number): void
  // A pin slipped off the flapper while the wheel ran at `share` of its peak.
  pinTick(share: number): void
  // The wheel stopped: the motor stops and the projector switches off.
  spinEnd(): void
  // A close call's cue, `secondsToStop` before the wheel stops: the music
  // drops out (its source keeps running), the audience gasps and a drumroll builds.
  closeCall(secondsToStop: number): void
  // A close call's release: the drumroll ends and a cymbal crashes. At the flapper slipping
  // off the peg for a slip, at the stop for a bend.
  closeCallBreak(): void
  // A drumroll that builds over `seconds` while a can is about to open, on its own: the music plays on.
  drumroll(seconds: number): void
  // The drumroll's release: it ends and a cymbal crashes, as the can opens.
  drumrollBreak(): void
  // The wheel stopped and the reveal opens `revealInSeconds` later (0 for
  // none): the loop dips under the stinger, whose hit lands as the reveal
  // opens with the applause, and the loop settles to a quieter bed. After a
  // close call a cheer joins the applause, and the loop, silent till now,
  // returns to the bed after the stinger.
  landed(revealInSeconds: number, closeCall?: boolean): void
  // The reveal closed: the music fades out and stops.
  revealClosed(): void
}

export interface SoundDeps {
  // Null where there is no Web Audio.
  createContext(): AudioContext | null
  load(name: SoundName): Promise<ArrayBuffer>
  // The seasons' sound sets; the shipped ones when left out (tests pass their own).
  sets?: SoundSets
  // Picks a win sound among a season's variants; Math.random when left out.
  random?: () => number
}

export const silentSound: SoundEngine = {
  attach: () => () => {},
  apply: () => {},
  setSeason: () => {},
  spinStart: () => {},
  musicStart: () => {},
  musicResume: () => {},
  beep: () => {},
  wildcardLanded: () => {},
  reelCut: () => {},
  cueBeep: () => {},
  reelChange: () => {},
  landedQuiet: () => {},
  fanfare: () => {},
  knock: () => {},
  slam: () => {},
  spinSpeed: () => {},
  pinTick: () => {},
  spinEnd: () => {},
  closeCall: () => {},
  closeCallBreak: () => {},
  drumroll: () => {},
  drumrollBreak: () => {},
  landed: () => {},
  revealClosed: () => {},
}

// The hum's loop points in its file: 0.1 s of margin on each side, so the
// encoder's padding is never looped.
export const humLoopStart = 0.1
export const humLoopEnd = 8.1
// The hum at full speed, and how far it falls as the wheel slows.
export const minHumRate = 0.6
export const minHumGain = 0.4
const humLevel = 0.9
// A season's spin bells: at full speed, how far they fall as the wheel slows (gain, and gently the rate).
export const bellsLevel = 0.5
export const minBellsGain = 0.15
export const minBellsRate = 0.85
// A season's win sound, played with the applause.
export const winLevel = 1
// Only in this last moment before the stop does the hum fade to silence.
export const humFadeSeconds = 0.3
// The music loop's points in its file: a 2 s lead-in (the wind-up), then the
// body that loops, with 0.1 s of margin after the end for the encoder's padding.
export const loopStart = marchSet.loop.loopStart
export const loopEnd = marchSet.loop.loopEnd
// Levels on the music bus: the loop at full, dipped under the stinger, and the
// bed it settles to while the reveal is open.
export const loopLevel = 0.8
export const dipLevel = 0.25
export const bedLevel = 0.4
const stingerLevel = 0.9
const applauseLevel = 0.7
// A close call's cheer, laid over the applause, and its gasp, drumroll (which builds from
// the first level to the second) and cymbal.
export const cheerLevel = 1
const gaspLevel = 0.8
const drumrollStartLevel = 0.3
const drumrollEndLevel = 1
const cymbalLevel = 0.9
// How fast the loop drops at the cue, and the drumroll stops at the stop.
const loopDropSeconds = 0.8
const drumrollStopSeconds = 0.05
// The drumroll's loop points in its file (0.1 s of margin each side for the encoder's padding),
// and how long it takes to fade in, as the music fades out.
export const drumrollLoopStart = 0.1
export const drumrollLoopEnd = 1.7
const drumrollFadeInSeconds = 0.8
// Where the stinger's main hit falls in its file, and its length.
export const stingerHit = marchSet.stinger.hit
export const stingerSeconds = marchSet.stinger.seconds
// How long the music takes to fade out when the reveal closes.
export const musicFadeSeconds = 2
const fadeFloor = 0.001
// No tick sounds sooner than this after another (on the audio clock).
export const minTickGap = 0.03
// The leader beep: its pitch, length and level.
export const beepHz = 1000
const beepSeconds = 0.12
const beepLevel = 0.3
// The cue beeps are softer and rounder than the leader's.
const cueBeepLevel = 0.18
// The cue mark's beep: higher than the leader's, and shorter.
export const cueBeepHz = 1600
const cueBeepSeconds = 0.09
// The wildcard wheel's sounds: the march is cut over a moment, the ambience loops over its
// whole file (less the encoder's margin). At the cue the loop winds down over cutSeconds to a reel's
// slow turn; the march gives way to its distorted twin over crossSeconds.
export const cutSeconds = 0.7
export const windDownRate = 0.4
export const crossSeconds = 0.5
export const ambienceLevel = 0.7
const runoutLevel = 0.8
const clunkLevel = 0.8
// The live twin's level on the music bus, after its worn-reel chain.
export const distortedLevel = 0.7
// The twin's worn-reel figures: the speed wanders by cents, the gate flickers at the projector's 24 frames a
// second, hiss and dust lie under it, and now and then the sound drops out for a moment.
const twinWanderHz = 0.35
const twinWanderCents = 28
const twinFlutterHz = 2.1
const twinFlutterCents = 7
const twinFlickerHz = 24
const twinFlickerDepth = 0.08
const twinHissLevel = 0.012
const twinDustLevel = 0.05
const twinDropouts = 4
const twinDropoutSeconds = 0.09
// The ambience: the loop at half speed, low-passed, with a short echo, over the projector hum (a fifth of its level),
// hiss and dust.
export const ambienceRate = 0.5
const ambienceLowpassHz = 700
const ambienceEchoSeconds = 0.31
const ambienceEchoFeedback = 0.38
const ambienceEchoMix = 0.45
const ambienceHumShare = 0.2
const ambienceHumLowpassHz = 260
const ambienceHissLevel = 0.01
const ambienceDustLevel = 0.04
const clapLevel = 1
const knockLevel = 0.8
const ambienceStopSeconds = 0.4
// The ambience swells in rather than starting at full.
export const ambienceFadeInSeconds = 1.5
// The film-reel treatment of the wildcard wheel's win sounds: the soundtrack's band, a nasal bump, soft
// clipping, wow and flutter from a modulated delay, and a make-up gain.
const reelHighpassHz = 220
const reelLowpassHz = 4200
const reelDrive = 2.4
// Soft clipping adds loudness: the chain's make-up gain takes it back down, and the loud close-call sounds are trimmed.
const reelMakeup = 0.5
const reelTrim = 0.6
const reelWowHz = 0.7
const reelWowDepth = 0.0035
const reelFlutterHz = 7.3
const reelFlutterDepth = 0.0003
const reelCurve = (() => {
  const curve = new Float32Array(1024)
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1
    curve[i] = Math.tanh(reelDrive * x + 0.15 * x * x) / Math.tanh(reelDrive)
  }
  return curve
})()
const ambienceDipLevel = 0.25

const gestures = ['pointerdown', 'pointerup', 'keydown', 'touchend']

// Master gain: loudness is heard roughly logarithmically, so a square makes the
// slider's lower half usable.
export function volumeGain(volume: number): number {
  const level = Math.min(Math.max(volume, 0), 100) / 100
  return level * level
}

export function createSound(deps: SoundDeps): SoundEngine {
  let ctx: AudioContext | null = null
  let master: GainNode
  let effects: GainNode
  let music: GainNode
  let noise: AudioBuffer
  let settings: SoundSettings = { music: 100, effects: 100, volume: 70, muted: false }
  let loading = false
  const buffers: Partial<Record<SoundName, AudioBuffer>> = {}
  let hum: { source: AudioBufferSourceNode; gain: GainNode } | null = null
  // The season's sleigh bells while a spin runs, if its file is decoded.
  let bells: { source: AudioBufferSourceNode; gain: GainNode } | null = null
  const sets = deps.sets ?? soundSets
  let season: SeasonId | null = null
  // The files asked for already, so none is fetched twice a session.
  const requested = new Set<SoundName>()
  let lastTick = -Infinity
  let win: GainNode
  let crowd: GainNode
  // The loop while it plays or fades; the stinger and applause, which fade
  // with it.
  // The loop's part is the set whose figures it plays by, for as long as it plays.
  // `extras` stops what a live twin's chain started, at the time given.
  let loop: { source: AudioBufferSourceNode; gain: GainNode; startedAt: number; part: LoopPart; extras?: (at: number) => void } | null = null
  // Whether a close call has silenced the loop, which then has nothing to give way to.
  let loopSilenced = false
  // The wildcard wheel's ambience while it plays; and whether the spin under way is the wildcard wheel's.
  let ambience: { source: AudioBufferSourceNode; gain: GainNode; extras: (at: number) => void } | null = null
  let cardsSpin = false
  // The film-reel chains the wildcard wheel's win sounds pass through while it shows, and the teardown.
  let reelFx: { effects: GainNode; music: GainNode; stop: () => void } | null = null
  let wins: AudioBufferSourceNode[] = []
  // The close call's drumroll while it plays.
  let roll: { source: AudioBufferSourceNode; gain: GainNode } | null = null

  function setGains(immediately: boolean) {
    if (!ctx) return
    const set = (gain: GainNode, value: number) => {
      if (immediately) gain.gain.value = value
      else gain.gain.setTargetAtTime(value, ctx!.currentTime, 0.01)
    }
    // Music and Effects are levels that can't pass the overall volume.
    set(master, settings.muted ? 0 : 1)
    set(effects, volumeGain(Math.min(settings.effects, settings.volume)))
    set(music, volumeGain(Math.min(settings.music, settings.volume)))
  }

  function fetchSound(name: SoundName) {
    if (requested.has(name)) return
    requested.add(name)
    deps
      .load(name)
      .then((data) => ctx!.decodeAudioData(data))
      .then((buffer) => {
        buffers[name] = buffer
      })
      .catch(() => {})
  }

  function load() {
    if (loading) return
    loading = true
    for (const name of ['on', 'hum', 'off', 'loop', 'stinger', 'applause', 'gasp', 'drumroll', 'cymbal', 'cheer', 'runout', 'clunk', 'clap', 'knock'] as const) {
      fetchSound(name)
    }
  }

  // The active season's files, fetched only while it is set and has a sound set, and once the context exists.
  function loadSeason() {
    const set = season ? sets[season] : undefined
    if (!ctx || !set) return
    for (const name of setFiles(set)) fetchSound(name)
  }

  // Each part of the soundtrack is chosen at its own cue: the season's if its file is decoded, else the march's.
  function pickLoop(): LoopPart {
    const part = season ? sets[season]?.loop : undefined
    return part && buffers[part.name] ? part : marchSet.loop
  }

  function pickStinger(): StingerPart | null {
    const part = season ? sets[season]?.stinger : undefined
    if (part && buffers[part.name]) return part
    return buffers.stinger ? marchSet.stinger : null
  }

  // One of the season's win sound variants that is decoded, chosen at random.
  function pickWin() {
    const decoded = (season ? sets[season]?.win : undefined)?.filter((v) => buffers[v.name]) ?? []
    if (decoded.length === 0) return null
    return decoded[Math.min(Math.floor((deps.random ?? Math.random)() * decoded.length), decoded.length - 1)]
  }

  function pickBells(): BellsPart | null {
    const part = season ? sets[season]?.bells : undefined
    return part && buffers[part.name] ? part : null
  }

  function unlock() {
    if (!ctx) {
      try {
        ctx = deps.createContext()
      } catch {
        ctx = null
      }
      if (!ctx) return
      master = ctx.createGain()
      effects = ctx.createGain()
      music = ctx.createGain()
      effects.connect(master)
      music.connect(master)
      master.connect(ctx.destination)
      win = ctx.createGain()
      win.connect(music)
      // The applause is an effect: it rides the effects bus.
      crowd = ctx.createGain()
      crowd.connect(effects)
      // A short burst of white noise, the tick's click.
      noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.03), ctx.sampleRate)
      const samples = noise.getChannelData(0)
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1
      setGains(true)
      load()
      loadSeason()
    }
    if (ctx.state !== 'running') ctx.resume().catch(() => {})
  }

  // Where a sound for the effects bus goes: through the reel chain while the wildcard wheel shows, if it wants the treatment.
  function effectsIn(fx: boolean): AudioNode {
    return fx && reelFx ? reelFx.effects : effects
  }

  function play(name: SoundName, level?: number, fx = false) {
    const buffer = buffers[name]
    if (!ctx || !buffer) return null
    const source = ctx.createBufferSource()
    source.buffer = buffer
    if (level === undefined) {
      source.connect(effectsIn(fx))
    } else {
      const gain = ctx.createGain()
      gain.gain.value = fx && reelFx ? level * reelTrim : level
      source.connect(gain)
      gain.connect(effectsIn(fx))
    }
    source.start()
    return source
  }

  // One film-reel chain into `dest`: the soundtrack's band, a nasal bump, soft clipping, then wow and
  // flutter from a delay whose time two slow oscillators move. Returns its input and a teardown.
  function makeReelChain(dest: AudioNode) {
    const c = ctx!
    const input = c.createGain()
    const highpass = c.createBiquadFilter()
    highpass.type = 'highpass'
    highpass.frequency.value = reelHighpassHz
    const lowpass = c.createBiquadFilter()
    lowpass.type = 'lowpass'
    lowpass.frequency.value = reelLowpassHz
    const nasal = c.createBiquadFilter()
    nasal.type = 'peaking'
    nasal.frequency.value = 1300
    nasal.Q.value = 0.8
    nasal.gain.value = 5
    const shaper = c.createWaveShaper()
    shaper.curve = reelCurve
    const delay = c.createDelay(0.05)
    delay.delayTime.value = 0.012
    const out = c.createGain()
    out.gain.value = reelMakeup
    input.connect(highpass)
    highpass.connect(lowpass)
    lowpass.connect(nasal)
    nasal.connect(shaper)
    shaper.connect(delay)
    delay.connect(out)
    out.connect(dest)
    const oscillators = [
      [reelWowHz, reelWowDepth],
      [reelFlutterHz, reelFlutterDepth],
    ].map(([hz, depth]) => {
      const lfo = c.createOscillator()
      lfo.frequency.value = hz
      const amount = c.createGain()
      amount.gain.value = depth
      lfo.connect(amount)
      amount.connect(delay.delayTime)
      lfo.start()
      return lfo
    })
    return {
      input,
      // Stops the chain's oscillators, at `at` if given (and then leaves it connected, for a tail to ring out).
      stop: (at?: number) => {
        for (const lfo of oscillators) lfo.stop(at)
        if (at === undefined) out.disconnect()
      },
    }
  }

  // A noise source for hiss (white, high-passed by the caller) or dust (sparse clicks): a looping buffer made once.
  const noiseBuffers: { hiss?: AudioBuffer; dust?: AudioBuffer } = {}
  function noiseLoop(kind: 'hiss' | 'dust') {
    const c = ctx!
    let buffer = noiseBuffers[kind]
    if (!buffer) {
      buffer = c.createBuffer(1, Math.ceil(c.sampleRate * 2), c.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < data.length; i++) {
        data[i] = kind === 'hiss' ? Math.random() * 2 - 1 : Math.random() < 0.0004 ? (Math.random() * 2 - 1) * 4 : 0
      }
      noiseBuffers[kind] = buffer
    }
    const source = c.createBufferSource()
    source.buffer = buffer
    source.loop = true
    return source
  }

  // A low-level layer of hiss and dust into `dest`; the sources go on `live`.
  function wearBed(dest: AudioNode, hissLevel: number, dustLevel: number, live: { stop(at?: number): void }[]) {
    const c = ctx!
    const hiss = noiseLoop('hiss')
    const hissFilter = c.createBiquadFilter()
    hissFilter.type = 'highpass'
    hissFilter.frequency.value = 3500
    const hissGain = c.createGain()
    hissGain.gain.value = hissLevel
    hiss.connect(hissFilter)
    hissFilter.connect(hissGain)
    hissGain.connect(dest)
    hiss.start()
    const dust = noiseLoop('dust')
    const dustGain = c.createGain()
    dustGain.gain.value = dustLevel
    dust.connect(dustGain)
    dustGain.connect(dest)
    dust.start()
    live.push(hiss, dust)
  }

  // While the wildcard wheel shows, its win sounds (the stinger, the applause and cheer, the close call's
  // gasp, drumroll and cymbal) pass through the film-reel chains; leaving it puts them back on the plain buses.
  function setReelMode(on: boolean) {
    if (!ctx || on === (reelFx !== null)) return
    if (on) {
      const fxEffects = makeReelChain(effects)
      const fxMusic = makeReelChain(music)
      win.disconnect()
      win.connect(fxMusic.input)
      crowd.disconnect()
      crowd.connect(fxEffects.input)
      reelFx = {
        effects: fxEffects.input,
        music: fxMusic.input,
        stop: () => {
          fxEffects.stop()
          fxMusic.stop()
        },
      }
    } else {
      win.disconnect()
      win.connect(music)
      crowd.disconnect()
      crowd.connect(effects)
      reelFx?.stop()
      reelFx = null
    }
  }

  // Ends the drumroll, if it still plays, over a moment so it does not click.
  function stopRoll() {
    if (!ctx || !roll) return
    const { source, gain } = roll
    roll = null
    ramp(gain, 0, ctx.currentTime, drumrollStopSeconds)
    source.stop(ctx.currentTime + drumrollStopSeconds + 0.02)
  }

  // The drumroll: it loops for `seconds` and builds by a ramp, fading in over its first moments.
  function startRoll(seconds: number) {
    const buffer = buffers.drumroll
    if (!ctx || !buffer) return
    const now = ctx.currentTime
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true
    source.loopStart = drumrollLoopStart
    source.loopEnd = Math.min(drumrollLoopEnd, buffer.duration)
    const gain = ctx.createGain()
    gain.gain.value = 0
    source.connect(gain)
    gain.connect(effectsIn(true))
    source.start(now, 0)
    const fadeIn = Math.min(drumrollFadeInSeconds, seconds)
    ramp(gain, drumrollStartLevel, now, fadeIn)
    gain.gain.linearRampToValueAtTime(drumrollEndLevel, now + Math.max(seconds, fadeIn + 0.1))
    roll = { source, gain }
  }

  // The music loop of the active set (the march's when the season's is not decoded).
  function startLoop(offset = 0, level = loopLevel) {
    const part = pickLoop()
    const buffer = buffers[part.name]
    if (!ctx || !buffer) return null
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true
    source.loopStart = part.loopStart
    source.loopEnd = Math.min(part.loopEnd, buffer.duration)
    const gain = ctx.createGain()
    gain.gain.value = level
    source.connect(gain)
    gain.connect(music)
    source.start(0, offset)
    loopSilenced = false
    loop = { source, gain, startedAt: ctx.currentTime - offset, part }
    return loop
  }

  // The playing loop's distorted twin, made live: its own buffer from `offset`, wandering in speed, through the
  // film-reel band and soft clipping, with a 24 fps gate flicker, hiss, dust and now and then a dropout.
  function startTwin(offset: number) {
    const playing = loop
    const buffer = playing ? buffers[playing.part.name] : undefined
    if (!ctx || !playing || !buffer) return null
    const c = ctx
    const part = playing.part
    const live: { stop(at?: number): void }[] = []
    const source = c.createBufferSource()
    source.buffer = buffer
    source.loop = true
    source.loopStart = part.loopStart
    source.loopEnd = Math.min(part.loopEnd, buffer.duration)
    // The speed wanders: two slow oscillators move the source's detune.
    for (const [hz, cents] of [
      [twinWanderHz, twinWanderCents],
      [twinFlutterHz, twinFlutterCents],
    ]) {
      const lfo = c.createOscillator()
      lfo.frequency.value = hz
      const depth = c.createGain()
      depth.gain.value = cents
      lfo.connect(depth)
      depth.connect(source.detune)
      lfo.start()
      live.push(lfo)
    }
    const gain = c.createGain()
    gain.gain.value = 0
    source.connect(gain)
    wearBed(gain, twinHissLevel, twinDustLevel, live)
    // The gate flickers 24 times a second.
    const flicker = c.createGain()
    flicker.gain.value = 1 - twinFlickerDepth
    const gate = c.createOscillator()
    gate.frequency.value = twinFlickerHz
    const gateDepth = c.createGain()
    gateDepth.gain.value = twinFlickerDepth
    gate.connect(gateDepth)
    gateDepth.connect(flicker.gain)
    gate.start()
    live.push(gate)
    // Dropouts: a few short dips on the audio clock over the moments the twin plays.
    const dropout = c.createGain()
    dropout.gain.value = 1
    const now = c.currentTime
    let at = now + 0.8
    for (let i = 0; i < twinDropouts; i++) {
      at += 0.6 + Math.random() * 2.2
      dropout.gain.setValueAtTime(1, at)
      dropout.gain.linearRampToValueAtTime(0.1, at + 0.015)
      dropout.gain.setValueAtTime(0.1, at + twinDropoutSeconds - 0.015)
      dropout.gain.linearRampToValueAtTime(1, at + twinDropoutSeconds)
    }
    const chain = makeReelChain(music)
    gain.connect(flicker)
    flicker.connect(dropout)
    dropout.connect(chain.input)
    source.start(0, offset)
    loopSilenced = false
    loop = {
      source,
      gain,
      startedAt: now - offset,
      part,
      extras: (when) => {
        for (const node of live) node.stop(when)
        chain.stop(when)
      },
    }
    return loop
  }

  // Stops a loop (the march or its twin) with everything its chain started.
  function stopLoopAt(l: NonNullable<typeof loop>, at: number) {
    l.source.stop(at)
    l.extras?.(at)
  }

  // The background that plays now: the loop, or on the wildcard wheel the ambience.
  function bed() {
    if (loop) return { gain: loop.gain, full: loopLevel, rest: bedLevel, dip: dipLevel }
    if (ambience) return { gain: ambience.gain, full: ambienceLevel, rest: ambienceLevel, dip: ambienceDipLevel }
    return null
  }

  // Where the march has reached in its file, wrapping at the loop's end.
  function loopPosition() {
    if (!ctx || !loop) return 0
    const t = ctx.currentTime - loop.startedAt
    const { loopStart: start, loopEnd: end } = loop.part
    return t < end ? t : start + ((t - start) % (end - start))
  }

  // The wildcard wheel's ambience, made live from the active set's loop: at half speed (an octave down),
  // low-passed with a short echo, over the projector hum low-passed at a fifth of its level, with hiss and dust.
  function startAmbience() {
    const part = pickLoop()
    const buffer = buffers[part.name]
    if (!ctx || !buffer) return
    stopAmbience()
    const c = ctx
    const live: { stop(at?: number): void }[] = []
    const bedGain = c.createGain()
    bedGain.gain.value = 0
    bedGain.connect(music)
    const source = c.createBufferSource()
    source.buffer = buffer
    source.loop = true
    source.loopStart = part.loopStart
    source.loopEnd = Math.min(part.loopEnd, buffer.duration)
    source.playbackRate.value = ambienceRate
    const lowpass = c.createBiquadFilter()
    lowpass.type = 'lowpass'
    lowpass.frequency.value = ambienceLowpassHz
    const dry = c.createGain()
    const echo = c.createDelay(1)
    echo.delayTime.value = ambienceEchoSeconds
    const feedback = c.createGain()
    feedback.gain.value = ambienceEchoFeedback
    const wet = c.createGain()
    wet.gain.value = ambienceEchoMix
    source.connect(lowpass)
    lowpass.connect(dry)
    dry.connect(bedGain)
    dry.connect(echo)
    echo.connect(feedback)
    feedback.connect(echo)
    echo.connect(wet)
    wet.connect(bedGain)
    source.start(0, part.loopStart)
    live.push(source)
    const humBuffer = buffers.hum
    if (humBuffer) {
      const hum = c.createBufferSource()
      hum.buffer = humBuffer
      hum.loop = true
      hum.loopStart = humLoopStart
      hum.loopEnd = Math.min(humLoopEnd, humBuffer.duration)
      const humFilter = c.createBiquadFilter()
      humFilter.type = 'lowpass'
      humFilter.frequency.value = ambienceHumLowpassHz
      const humGain = c.createGain()
      humGain.gain.value = humLevel * ambienceHumShare
      hum.connect(humFilter)
      humFilter.connect(humGain)
      humGain.connect(bedGain)
      hum.start(0, humLoopStart)
      live.push(hum)
    }
    wearBed(bedGain, ambienceHissLevel, ambienceDustLevel, live)
    ramp(bedGain, ambienceLevel, c.currentTime, ambienceFadeInSeconds)
    ambience = {
      source,
      gain: bedGain,
      extras: (when) => {
        for (const node of live) node.stop(when)
      },
    }
  }

  // Ends the ambience's source and everything its chain started.
  function stopAmbienceAt(a: NonNullable<typeof ambience>, at: number) {
    a.source.stop(at)
    a.extras(at)
  }

  // Lets the ambience go over a moment, so it does not click.
  function stopAmbience() {
    if (!ctx || !ambience) return
    const a = ambience
    ambience = null
    ramp(a.gain, 0, ctx.currentTime, ambienceStopSeconds)
    stopAmbienceAt(a, ctx.currentTime + ambienceStopSeconds + 0.02)
  }

  // Winds the loop down like a dying reel, slowing and fading, and stops it.
  function windDownLoop() {
    if (!ctx || !loop) return
    const l = loop
    const { source, gain } = l
    loop = null
    const now = ctx.currentTime
    ramp(gain, 0, now, cutSeconds)
    source.playbackRate.setValueAtTime(1, now)
    source.playbackRate.linearRampToValueAtTime(windDownRate, now + cutSeconds)
    stopLoopAt(l, now + cutSeconds + 0.02)
  }

  // The bells follow the wheel as the hum does: louder and a touch faster at the peak, thinning as it creeps.
  function bellsTargets(share: number, secondsLeft: number) {
    const s = Math.min(Math.max(share, 0), 1)
    const fade = Math.min(Math.max(secondsLeft / humFadeSeconds, 0), 1)
    return {
      rate: minBellsRate + (1 - minBellsRate) * s,
      gain: bellsLevel * (minBellsGain + (1 - minBellsGain) * s) * fade,
    }
  }

  function startBells() {
    const part = pickBells()
    const buffer = part ? buffers[part.name] : undefined
    if (!ctx || !part || !buffer) return
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true
    source.loopStart = part.loopStart
    source.loopEnd = Math.min(part.loopEnd, buffer.duration)
    const gain = ctx.createGain()
    const { rate, gain: level } = bellsTargets(0, Infinity)
    source.playbackRate.value = rate
    gain.gain.value = level
    source.connect(gain)
    // On the plain effects bus, never through the film-reel chain.
    gain.connect(effects)
    source.start(0, part.loopStart)
    bells = { source, gain }
  }

  function stopBells() {
    if (!ctx || !bells) return
    const { source, gain } = bells
    bells = null
    gain.gain.setTargetAtTime(0, ctx.currentTime, 0.01)
    source.stop(ctx.currentTime + 0.06)
  }

  function humTargets(share: number, secondsLeft: number) {
    const s = Math.min(Math.max(share, 0), 1)
    const fade = Math.min(Math.max(secondsLeft / humFadeSeconds, 0), 1)
    return {
      rate: minHumRate + (1 - minHumRate) * s,
      gain: humLevel * (minHumGain + (1 - minHumGain) * s) * fade,
    }
  }

  function stopHum() {
    stopBells()
    if (!ctx || !hum) return
    const { source, gain } = hum
    hum = null
    gain.gain.setTargetAtTime(0, ctx.currentTime, 0.01)
    source.stop(ctx.currentTime + 0.06)
  }

  // Ramps a gain from where it is to `value` over `seconds`, starting at `at`.
  function ramp(gain: GainNode, value: number, at: number, seconds: number) {
    gain.gain.cancelScheduledValues(at)
    gain.gain.setValueAtTime(gain.gain.value, at)
    gain.gain.linearRampToValueAtTime(value, at + seconds)
  }

  // A fade to silence that sounds even: a fall of equal decibels per second
  // (exponential), not a straight line, which seems to drop away at the end.
  function fadeOut(gain: GainNode, at: number, seconds: number) {
    gain.gain.cancelScheduledValues(at)
    gain.gain.setValueAtTime(Math.max(gain.gain.value, fadeFloor), at)
    gain.gain.exponentialRampToValueAtTime(fadeFloor, at + seconds)
    gain.gain.setValueAtTime(0, at + seconds)
  }

  function playWin(name: SoundName, to: GainNode, when: number, offset: number, level: number) {
    const buffer = buffers[name]
    if (!ctx || !buffer) return
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const gain = ctx.createGain()
    gain.gain.value = level
    source.connect(gain)
    gain.connect(to)
    source.start(when, offset)
    wins.push(source)
  }

  // Ends the loop and any win sounds at once.
  function stopMusic() {
    if (!ctx) return
    if (loop) stopLoopAt(loop, 0)
    if (ambience) stopAmbienceAt(ambience, 0)
    for (const source of wins) source.stop()
    loop = null
    ambience = null
    wins = []
    setReelMode(false)
    for (const gain of [win, crowd]) {
      gain.gain.cancelScheduledValues(0)
      gain.gain.value = 1
    }
  }

  // The spin's loop: the march; the wildcard wheel keeps its ambience instead.
  function startSpinMusic() {
    if (!ctx || cardsSpin) return
    startLoop()
  }

  // The background dips under the stinger and comes back up to its bed as it ends; without the
  // stinger there is nothing to dip under.
  function dipLoop(now: number, hold: number, lead: number, stinger: StingerPart | null) {
    const b = bed()
    if (!b) return
    if (!stinger) return ramp(b.gain, b.rest, now, 0.5)
    const end = now + hold - lead + (stinger.seconds - (stinger.hit - lead))
    ramp(b.gain, b.dip, now, 0.15)
    // Back up as the stinger ends, to the bed.
    b.gain.gain.setValueAtTime(b.dip, end - 0.5)
    b.gain.gain.linearRampToValueAtTime(b.rest, end)
  }

  // The stinger and applause, the stinger's hit `hold` seconds from now, the loop dipping under
  // them and coming back to the bed as the stinger ends.
  function playFanfare(hold: number, cheer = false) {
    if (!ctx) return null
    const now = ctx.currentTime
    // The hit lands as the reveal opens: start the stinger's swell early
    // enough, or, with no hold, from its hit.
    const stinger = pickStinger()
    if (stinger) {
      const lead = Math.min(stinger.hit, hold)
      playWin(stinger.name, win, now + hold - lead, stinger.hit - lead, stingerLevel)
    }
    playWin('applause', crowd, now + hold, 0, applauseLevel)
    // A season's win sound plays with the applause.
    const voice = pickWin()
    if (voice) playWin(voice.name, crowd, now + hold, 0, winLevel)
    if (cheer) playWin('cheer', crowd, now + hold, 0, cheerLevel)
    return stinger
  }

  return {
    attach(target) {
      for (const type of gestures) target.addEventListener(type, unlock, true)
      return () => {
        for (const type of gestures) target.removeEventListener(type, unlock, true)
      }
    },
    apply(next) {
      settings = next
      setGains(false)
    },
    setSeason(next) {
      season = next
      loadSeason()
    },
    spinStart(countdown = false, cards = false) {
      if (!ctx) return
      cardsSpin = cards
      stopHum()
      stopRoll()
      if (!cards) stopMusic()
      play('on')
      if (!countdown) startSpinMusic()
      startBells()
      const buffer = buffers.hum
      if (!buffer) return
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.loop = true
      source.loopStart = humLoopStart
      source.loopEnd = Math.min(humLoopEnd, buffer.duration)
      const gain = ctx.createGain()
      const { rate, gain: level } = humTargets(0, Infinity)
      source.playbackRate.value = rate
      gain.gain.value = level
      source.connect(gain)
      gain.connect(effects)
      source.start(0, humLoopStart)
      hum = { source, gain }
    },
    musicStart() {
      startSpinMusic()
    },
    musicResume() {
      const b = bed()
      if (!ctx || !b) return
      loopSilenced = false
      ramp(b.gain, b.full, ctx.currentTime, 0.5)
    },
    wildcardLanded() {
      if (!ctx) return
      play('runout', runoutLevel)
      // The march turns into its distorted twin from where it has reached (one a close call has
      // silenced has nothing to give way to).
      if (!loop || loopSilenced) return
      const now = ctx.currentTime
      const march = loop
      const position = loopPosition()
      ramp(march.gain, 0, now, crossSeconds)
      stopLoopAt(march, now + crossSeconds + 0.02)
      const twin = startTwin(position)
      if (twin) ramp(twin.gain, distortedLevel, now, crossSeconds)
    },
    reelCut() {
      if (!ctx) return
      windDownLoop()
    },
    cueBeep() {
      if (!ctx) return
      const at = ctx.currentTime
      const out = ctx.createGain()
      out.gain.setValueAtTime(cueBeepLevel, at)
      out.gain.setValueAtTime(cueBeepLevel, at + cueBeepSeconds - 0.02)
      out.gain.linearRampToValueAtTime(0, at + cueBeepSeconds)
      out.connect(effects)
      const tone = ctx.createOscillator()
      tone.type = 'triangle'
      tone.frequency.setValueAtTime(cueBeepHz, at)
      tone.connect(out)
      tone.start(at)
      tone.stop(at + cueBeepSeconds)
    },
    reelChange() {
      if (!ctx) return
      play('clunk', clunkLevel)
      // A sub-board rolls in under the ambience already playing: it is left as it is.
      if (!ambience) startAmbience()
      setReelMode(true)
    },
    knock() {
      if (!ctx) return
      play('knock', knockLevel)
    },
    slam() {
      if (!ctx) return
      stopRoll()
      // The ambience goes out under the clap, whose reverb then rings into silence.
      stopAmbience()
      stopMusic()
      play('clap', clapLevel)
    },
    beep() {
      if (!ctx) return
      const at = ctx.currentTime
      const out = ctx.createGain()
      out.gain.setValueAtTime(beepLevel, at)
      out.gain.setValueAtTime(beepLevel, at + beepSeconds - 0.02)
      out.gain.linearRampToValueAtTime(0, at + beepSeconds)
      out.connect(effects)
      const tone = ctx.createOscillator()
      tone.type = 'sine'
      tone.frequency.setValueAtTime(beepHz, at)
      tone.connect(out)
      tone.start(at)
      tone.stop(at + beepSeconds)
    },
    spinSpeed(share, secondsLeft) {
      if (!ctx) return
      if (bells) {
        const target = bellsTargets(share, secondsLeft)
        bells.source.playbackRate.setTargetAtTime(target.rate, ctx.currentTime, 0.08)
        bells.gain.gain.setTargetAtTime(target.gain, ctx.currentTime, 0.08)
      }
      if (!hum) return
      const { rate, gain } = humTargets(share, secondsLeft)
      hum.source.playbackRate.setTargetAtTime(rate, ctx.currentTime, 0.08)
      hum.gain.gain.setTargetAtTime(gain, ctx.currentTime, 0.08)
    },
    pinTick(share) {
      if (!ctx) return
      const now = ctx.currentTime
      // A tick asked for too soon after the last waits for the next free slot,
      // so a fast wheel ticks at a steady rate; one more is dropped while a
      // tick is already waiting.
      const at = Math.max(now, lastTick + minTickGap)
      if (at - now > minTickGap + 1e-9) return
      lastTick = at
      // Quiet, and louder the slower the wheel.
      const level = 0.06 + 0.2 * (1 - Math.min(Math.max(share, 0), 1))
      const out = ctx.createGain()
      out.gain.setValueAtTime(level, at)
      out.gain.exponentialRampToValueAtTime(0.001, at + 0.03)
      out.connect(effects)
      const click = ctx.createBufferSource()
      click.buffer = noise
      const filter = ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.value = 2800
      filter.Q.value = 1.2
      click.connect(filter)
      filter.connect(out)
      click.start(at)
      const tone = ctx.createOscillator()
      tone.type = 'triangle'
      tone.frequency.setValueAtTime(1900, at)
      tone.frequency.exponentialRampToValueAtTime(600, at + 0.025)
      tone.connect(out)
      tone.start(at)
      tone.stop(at + 0.03)
    },
    spinEnd() {
      if (!ctx) return
      stopHum()
      play('off')
    },
    closeCall(secondsToStop) {
      if (!ctx) return
      const now = ctx.currentTime
      const b = bed()
      if (b) ramp(b.gain, 0, now, loopDropSeconds)
      if (loop) loopSilenced = true
      play('gasp', gaspLevel, true)
      // The roll loops for the whole approach and fades in as the music fades out, then
      // builds by a ramp to the stop.
      startRoll(secondsToStop)
    },
    closeCallBreak() {
      if (!ctx) return
      stopRoll()
      play('cymbal', cymbalLevel, true)
    },
    drumroll(seconds) {
      if (!ctx) return
      stopRoll()
      startRoll(seconds)
    },
    drumrollBreak() {
      if (!ctx) return
      stopRoll()
      play('cymbal', cymbalLevel, true)
    },
    landed(revealInSeconds, closeCall = false) {
      if (!ctx) return
      const now = ctx.currentTime
      const hold = Math.max(revealInSeconds, 0)
      const stinger = playFanfare(hold, closeCall)
      const lead = Math.min(stinger?.hit ?? 0, hold)
      const b = bed()
      if (!b) return
      if (closeCall) {
        // The background has been silent since the cue: it comes back as the stinger ends, from where it has reached.
        const end = stinger ? now + hold - lead + (stinger.seconds - (stinger.hit - lead)) : now + hold
        ramp(b.gain, 0, now, 0.05)
        b.gain.gain.setValueAtTime(0, end - 0.5)
        b.gain.gain.linearRampToValueAtTime(b.rest, end)
        return
      }
      dipLoop(now, hold, lead, stinger)
    },
    landedQuiet(closeCall = false) {
      if (!ctx) return
      const now = ctx.currentTime
      if (closeCall) playWin('cheer', crowd, now, 0, cheerLevel)
      const b = bed()
      if (!b) return
      // After a close call the background comes back up from silence to its bed, the cymbal having struck.
      ramp(b.gain, b.rest, now, closeCall ? 0.8 : 0.5)
    },
    fanfare(revealInSeconds) {
      if (!ctx) return
      const hold = Math.max(revealInSeconds, 0)
      const stinger = playFanfare(hold)
      dipLoop(ctx.currentTime, hold, Math.min(stinger?.hit ?? 0, hold), stinger)
    },
    revealClosed() {
      if (!ctx) return
      const now = ctx.currentTime
      stopRoll()
      if (ambience) {
        fadeOut(ambience.gain, now, musicFadeSeconds)
        stopAmbienceAt(ambience, now + musicFadeSeconds + 0.05)
      }
      if (loop) {
        fadeOut(loop.gain, now, musicFadeSeconds)
        stopLoopAt(loop, now + musicFadeSeconds + 0.05)
      }
      fadeOut(win, now, musicFadeSeconds)
      fadeOut(crowd, now, musicFadeSeconds)
      for (const w of wins) w.stop(now + musicFadeSeconds + 0.05)
      setReelMode(false)
    },
  }
}
