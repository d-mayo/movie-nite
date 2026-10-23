// The sound engine: one Web Audio context behind the wheel's spin, as plain
// TypeScript with no React. The context and the files are made on the first
// user gesture anywhere in the document (browsers keep audio locked until
// then); until then, and wherever Web Audio is missing (jsdom), every call does
// nothing. The graph is sources → effects bus (or music bus) → master gain →
// destination, and the settings drive the three gains. The music loop, the win
// stinger and the applause all ride the music bus.

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
  // Spin pressed: the projector switches on and its motor starts, and the music loop starts, unless
  // `countdown` says a leader countdown comes first, when the music waits for musicStart.
  // On the wildcard wheel (`cards`) the loop is the distorted one and the ambience gives way to it
  // (after the countdown, when there is one); a distorted loop that already plays keeps playing.
  spinStart(countdown?: boolean, cards?: boolean): void
  // Brings a loop a close call silenced back to its full level, with no stinger.
  musicResume(): void
  // The leader countdown ended: the music loop starts, as at an ordinary press.
  musicStart(): void
  // One leader beep, at the start of each number of the countdown.
  beep(): void
  // A wildcard landing that opens the wildcard wheel: the reel runs out, in place of the win sounds.
  wildcardLanded(): void
  // The cue marks begin: the march is cut and stops.
  reelCut(): void
  // One beep with each blink of the cue mark, pitched apart from the leader beep.
  cueBeep(): void
  // The wheels swap: the reel clunks and the ambience starts looping.
  reelChange(): void
  // The wildcard wheel's spin landed and its win sounds wait for the result: the loop settles to its
  // bed (after a close call, back up from silence) and a close call's cheer plays.
  landedQuiet(closeCall?: boolean): void
  // The stinger (its hit `revealInSeconds` from now) and the applause alone, the loop dipping under them.
  fanfare(revealInSeconds: number): void
  // A film can opened.
  knock(): void
  // Leaving the wildcard wheel: a clap ends the loop, ambience and win sounds, and the march plays one phrase.
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
}

export const silentSound: SoundEngine = {
  attach: () => () => {},
  apply: () => {},
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
// Only in this last moment before the stop does the hum fade to silence.
export const humFadeSeconds = 0.3
// The music loop's points in its file: a 2 s lead-in (the wind-up), then the
// body that loops, with 0.1 s of margin after the end for the encoder's padding.
export const loopStart = 2.0
export const loopEnd = 32.12
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
export const stingerHit = 1.65
export const stingerSeconds = 3.03
// How long the music takes to fade out when the reveal closes.
export const musicFadeSeconds = 2
const fadeFloor = 0.001
// No tick sounds sooner than this after another (on the audio clock).
export const minTickGap = 0.03
// The leader beep: its pitch, length and level.
export const beepHz = 1000
const beepSeconds = 0.12
const beepLevel = 0.3
// The cue mark's beep: higher than the leader's, and shorter.
export const cueBeepHz = 1600
const cueBeepSeconds = 0.09
// The wildcard wheel's sounds: the march is cut over a moment, the ambience loops over its
// whole file (less the encoder's margin), and the march plays a phrase after the clap, then fades.
export const cutSeconds = 0.08
export const ambienceLoopEnd = 60.54
const ambienceLevel = 0.7
const runoutLevel = 0.9
const clunkLevel = 0.9
const clapLevel = 1
const knockLevel = 0.8
const ambienceStopSeconds = 0.4
export const phraseSeconds = 4

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
  let lastTick = -Infinity
  let win: GainNode
  let crowd: GainNode
  // The loop while it plays or fades; the stinger and applause, which fade
  // with it.
  let loop: { source: AudioBufferSourceNode; gain: GainNode; distorted: boolean } | null = null
  // The wildcard wheel's ambience, and the march's phrase after the slam, while they play; and
  // whether the spin under way is the wildcard wheel's.
  let ambience: { source: AudioBufferSourceNode; gain: GainNode } | null = null
  let phrase: { source: AudioBufferSourceNode; gain: GainNode } | null = null
  let cardsSpin = false
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

  function load() {
    if (loading) return
    loading = true
    for (const name of ['on', 'hum', 'off', 'loop', 'stinger', 'applause', 'gasp', 'drumroll', 'cymbal', 'cheer', 'dloop', 'ambience', 'runout', 'clunk', 'clap', 'knock'] as const) {
      deps
        .load(name)
        .then((data) => ctx!.decodeAudioData(data))
        .then((buffer) => {
          buffers[name] = buffer
        })
        .catch(() => {})
    }
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
    }
    if (ctx.state !== 'running') ctx.resume().catch(() => {})
  }

  function play(name: SoundName, level?: number) {
    const buffer = buffers[name]
    if (!ctx || !buffer) return null
    const source = ctx.createBufferSource()
    source.buffer = buffer
    if (level === undefined) {
      source.connect(effects)
    } else {
      const gain = ctx.createGain()
      gain.gain.value = level
      source.connect(gain)
      gain.connect(effects)
    }
    source.start()
    return source
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
    gain.connect(effects)
    source.start(now, 0)
    const fadeIn = Math.min(drumrollFadeInSeconds, seconds)
    ramp(gain, drumrollStartLevel, now, fadeIn)
    gain.gain.linearRampToValueAtTime(drumrollEndLevel, now + Math.max(seconds, fadeIn + 0.1))
    roll = { source, gain }
  }

  // The march, or on the wildcard wheel its distorted twin: same lead-in and loop points.
  function startLoop(distorted = false) {
    const buffer = buffers[distorted ? 'dloop' : 'loop']
    if (!ctx || !buffer) return
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true
    source.loopStart = loopStart
    source.loopEnd = Math.min(loopEnd, buffer.duration)
    const gain = ctx.createGain()
    gain.gain.value = loopLevel
    source.connect(gain)
    gain.connect(music)
    source.start(0, 0)
    loop = { source, gain, distorted }
  }

  function startAmbience() {
    const buffer = buffers.ambience
    if (!ctx || !buffer) return
    stopAmbience()
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true
    source.loopStart = 0
    source.loopEnd = Math.min(ambienceLoopEnd, buffer.duration)
    const gain = ctx.createGain()
    gain.gain.value = ambienceLevel
    source.connect(gain)
    gain.connect(music)
    source.start(0, 0)
    ambience = { source, gain }
  }

  // Lets the ambience go over a moment, so it does not click.
  function stopAmbience() {
    if (!ctx || !ambience) return
    const { source, gain } = ambience
    ambience = null
    ramp(gain, 0, ctx.currentTime, ambienceStopSeconds)
    source.stop(ctx.currentTime + ambienceStopSeconds + 0.02)
  }

  // Cuts the loop over a moment and stops it.
  function cutLoop() {
    if (!ctx || !loop) return
    const { source, gain } = loop
    loop = null
    ramp(gain, 0, ctx.currentTime, cutSeconds)
    source.stop(ctx.currentTime + cutSeconds + 0.02)
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

  function playWin(name: 'stinger' | 'applause' | 'cheer', when: number, offset: number, level: number) {
    const buffer = buffers[name]
    if (!ctx || !buffer) return
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const gain = ctx.createGain()
    gain.gain.value = level
    source.connect(gain)
    gain.connect(name === 'stinger' ? win : crowd)
    source.start(when, offset)
    wins.push(source)
  }

  // Ends the loop and any win sounds at once.
  function stopMusic() {
    if (!ctx) return
    if (loop) loop.source.stop()
    if (ambience) ambience.source.stop()
    if (phrase) phrase.source.stop()
    for (const source of wins) source.stop()
    loop = null
    ambience = null
    phrase = null
    wins = []
    for (const gain of [win, crowd]) {
      gain.gain.cancelScheduledValues(0)
      gain.gain.value = 1
    }
  }

  // The spin's loop: the march, or on the wildcard wheel the distorted one, which the ambience
  // gives way to and which keeps playing if it already does.
  function startSpinMusic() {
    if (!ctx) return
    if (!cardsSpin) return startLoop()
    if (loop?.distorted) return
    cutLoop()
    stopAmbience()
    startLoop(true)
  }

  // The loop dips under the stinger and comes back up to the bed as it ends; without the
  // stinger there is nothing to dip under.
  function dipLoop(now: number, hold: number, lead: number) {
    if (!loop) return
    if (!buffers.stinger) return ramp(loop.gain, bedLevel, now, 0.5)
    const end = now + hold - lead + (stingerSeconds - (stingerHit - lead))
    ramp(loop.gain, dipLevel, now, 0.15)
    // Back up as the stinger ends, to the bed.
    loop.gain.gain.setValueAtTime(dipLevel, end - 0.5)
    loop.gain.gain.linearRampToValueAtTime(bedLevel, end)
  }

  // The stinger and applause, the stinger's hit `hold` seconds from now, the loop dipping under
  // them and coming back to the bed as the stinger ends.
  function playFanfare(hold: number, cheer = false) {
    if (!ctx) return
    const now = ctx.currentTime
    // The hit lands as the reveal opens: start the stinger's swell early
    // enough, or, with no hold, from its hit.
    const lead = Math.min(stingerHit, hold)
    playWin('stinger', now + hold - lead, stingerHit - lead, stingerLevel)
    playWin('applause', now + hold, 0, applauseLevel)
    if (cheer) playWin('cheer', now + hold, 0, cheerLevel)
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
    spinStart(countdown = false, cards = false) {
      if (!ctx) return
      cardsSpin = cards
      stopHum()
      stopRoll()
      if (!cards) stopMusic()
      play('on')
      if (!countdown) startSpinMusic()
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
      if (!ctx || !loop) return
      ramp(loop.gain, loopLevel, ctx.currentTime, 0.5)
    },
    wildcardLanded() {
      play('runout', runoutLevel)
    },
    reelCut() {
      if (!ctx) return
      cutLoop()
    },
    cueBeep() {
      if (!ctx) return
      const at = ctx.currentTime
      const out = ctx.createGain()
      out.gain.setValueAtTime(beepLevel, at)
      out.gain.setValueAtTime(beepLevel, at + cueBeepSeconds - 0.02)
      out.gain.linearRampToValueAtTime(0, at + cueBeepSeconds)
      out.connect(effects)
      const tone = ctx.createOscillator()
      tone.type = 'square'
      tone.frequency.setValueAtTime(cueBeepHz, at)
      tone.connect(out)
      tone.start(at)
      tone.stop(at + cueBeepSeconds)
    },
    reelChange() {
      if (!ctx) return
      play('clunk', clunkLevel)
      startAmbience()
    },
    knock() {
      if (!ctx) return
      play('knock', knockLevel)
    },
    slam() {
      if (!ctx) return
      const now = ctx.currentTime
      stopRoll()
      stopMusic()
      play('clap', clapLevel)
      // The march comes back from its start for a phrase, then fades.
      const buffer = buffers.loop
      if (!buffer) return
      const source = ctx.createBufferSource()
      source.buffer = buffer
      const gain = ctx.createGain()
      gain.gain.value = loopLevel
      source.connect(gain)
      gain.connect(music)
      source.start(now, 0)
      fadeOut(gain, now + phraseSeconds, musicFadeSeconds)
      source.stop(now + phraseSeconds + musicFadeSeconds + 0.05)
      phrase = { source, gain }
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
      if (!ctx || !hum) return
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
      if (loop) ramp(loop.gain, 0, now, loopDropSeconds)
      play('gasp', gaspLevel)
      // The roll loops for the whole approach and fades in as the music fades out, then
      // builds by a ramp to the stop.
      startRoll(secondsToStop)
    },
    closeCallBreak() {
      if (!ctx) return
      stopRoll()
      play('cymbal', cymbalLevel)
    },
    drumroll(seconds) {
      if (!ctx) return
      stopRoll()
      startRoll(seconds)
    },
    drumrollBreak() {
      if (!ctx) return
      stopRoll()
      play('cymbal', cymbalLevel)
    },
    landed(revealInSeconds, closeCall = false) {
      if (!ctx) return
      const now = ctx.currentTime
      const hold = Math.max(revealInSeconds, 0)
      const lead = Math.min(stingerHit, hold)
      playFanfare(hold, closeCall)
      if (!loop) return
      if (closeCall) {
        // The loop has been silent since the cue: it comes back as the stinger ends, from where it has reached.
        const end = buffers.stinger ? now + hold - Math.min(stingerHit, hold) + (stingerSeconds - (stingerHit - Math.min(stingerHit, hold))) : now + hold
        ramp(loop.gain, 0, now, 0.05)
        loop.gain.gain.setValueAtTime(0, end - 0.5)
        loop.gain.gain.linearRampToValueAtTime(bedLevel, end)
        return
      }
      dipLoop(now, hold, lead)
    },
    landedQuiet(closeCall = false) {
      if (!ctx) return
      const now = ctx.currentTime
      if (closeCall) playWin('cheer', now, 0, cheerLevel)
      if (!loop) return
      // After a close call the loop comes back up from silence to the bed, the cymbal having struck.
      if (closeCall) ramp(loop.gain, bedLevel, now, 0.8)
      else ramp(loop.gain, bedLevel, now, 0.5)
    },
    fanfare(revealInSeconds) {
      if (!ctx) return
      const hold = Math.max(revealInSeconds, 0)
      playFanfare(hold)
      if (!loop) return
      dipLoop(ctx.currentTime, hold, Math.min(stingerHit, hold))
    },
    revealClosed() {
      if (!ctx) return
      const now = ctx.currentTime
      stopRoll()
      if (ambience) {
        fadeOut(ambience.gain, now, musicFadeSeconds)
        ambience.source.stop(now + musicFadeSeconds + 0.05)
      }
      if (phrase) {
        fadeOut(phrase.gain, now, musicFadeSeconds)
        phrase.source.stop(now + musicFadeSeconds + 0.05)
      }
      if (loop) {
        fadeOut(loop.gain, now, musicFadeSeconds)
        loop.source.stop(now + musicFadeSeconds + 0.05)
      }
      fadeOut(win, now, musicFadeSeconds)
      fadeOut(crowd, now, musicFadeSeconds)
      for (const w of wins) w.stop(now + musicFadeSeconds + 0.05)
    },
  }
}
