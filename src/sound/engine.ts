// The sound engine: one Web Audio context behind the wheel's spin, as plain
// TypeScript with no React. The context and the files are made on the first
// user gesture anywhere in the document (browsers keep audio locked until
// then); until then, and wherever Web Audio is missing (jsdom), every call does
// nothing. The graph is sources → effects bus (or music bus) → master gain →
// destination, and the settings drive the three gains. The music loop, the win
// stinger and the applause all ride the music bus.

export type SoundName = 'on' | 'hum' | 'off' | 'loop' | 'stinger' | 'applause'

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
  // Spin pressed: the projector switches on and its motor starts.
  spinStart(): void
  // The wheel's speed as a share (0 to 1) of the spin's peak, and the seconds
  // until it stops: the hum follows both.
  spinSpeed(share: number, secondsLeft: number): void
  // A pin slipped off the flapper while the wheel ran at `share` of its peak.
  pinTick(share: number): void
  // The wheel stopped: the motor stops and the projector switches off.
  spinEnd(): void
  // The wheel stopped and the reveal opens `revealInSeconds` later (0 for
  // none): the loop dips under the stinger, whose hit lands as the reveal
  // opens with the applause, and the loop settles to a quieter bed.
  landed(revealInSeconds: number): void
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
  spinSpeed: () => {},
  pinTick: () => {},
  spinEnd: () => {},
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
// Where the stinger's main hit falls in its file, and its length.
export const stingerHit = 1.65
export const stingerSeconds = 3.03
// How long the music takes to fade out when the reveal closes.
export const musicFadeSeconds = 2
const fadeFloor = 0.001
// No tick sounds sooner than this after another (on the audio clock).
export const minTickGap = 0.03

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
  let loop: { source: AudioBufferSourceNode; gain: GainNode } | null = null
  let wins: AudioBufferSourceNode[] = []

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
    for (const name of ['on', 'hum', 'off', 'loop', 'stinger', 'applause'] as const) {
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

  function play(name: SoundName) {
    const buffer = buffers[name]
    if (!ctx || !buffer) return
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(effects)
    source.start()
  }

  function startLoop() {
    const buffer = buffers.loop
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
    loop = { source, gain }
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

  function playWin(name: 'stinger' | 'applause', when: number, offset: number, level: number) {
    const buffer = buffers[name]
    if (!ctx || !buffer) return
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const gain = ctx.createGain()
    gain.gain.value = level
    source.connect(gain)
    gain.connect(name === 'applause' ? crowd : win)
    source.start(when, offset)
    wins.push(source)
  }

  // Ends the loop and any win sounds at once.
  function stopMusic() {
    if (!ctx) return
    if (loop) loop.source.stop()
    for (const source of wins) source.stop()
    loop = null
    wins = []
    for (const gain of [win, crowd]) {
      gain.gain.cancelScheduledValues(0)
      gain.gain.value = 1
    }
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
    spinStart() {
      if (!ctx) return
      stopHum()
      stopMusic()
      play('on')
      startLoop()
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
    landed(revealInSeconds) {
      if (!ctx) return
      const now = ctx.currentTime
      const hold = Math.max(revealInSeconds, 0)
      // The hit lands as the reveal opens: start the stinger's swell early
      // enough, or, with no hold, from its hit.
      const lead = Math.min(stingerHit, hold)
      playWin('stinger', now + hold - lead, stingerHit - lead, stingerLevel)
      playWin('applause', now + hold, 0, applauseLevel)
      if (!loop) return
      // Without the stinger there is nothing to dip under.
      if (!buffers.stinger) return ramp(loop.gain, bedLevel, now, 0.5)
      const end = now + hold - lead + (stingerSeconds - (stingerHit - lead))
      ramp(loop.gain, dipLevel, now, 0.15)
      // Back up as the stinger ends, to the bed.
      loop.gain.gain.setValueAtTime(dipLevel, end - 0.5)
      loop.gain.gain.linearRampToValueAtTime(bedLevel, end)
    },
    revealClosed() {
      if (!ctx) return
      const now = ctx.currentTime
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
