// The sound engine: one Web Audio context behind the wheel's spin, as plain
// TypeScript with no React. The context and the files are made on the first
// user gesture anywhere in the document (browsers keep audio locked until
// then); until then, and wherever Web Audio is missing (jsdom), every call does
// nothing. The graph is sources → effects bus (or music bus) → master gain →
// destination, and the settings drive the three gains.

export type SoundName = 'on' | 'hum' | 'off'

export interface SoundSettings {
  music: boolean
  effects: boolean
  // 0 to 100.
  volume: number
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
// No tick sounds sooner than this after another.
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
  let settings: SoundSettings = { music: true, effects: true, volume: 70 }
  let loading = false
  const buffers: Partial<Record<SoundName, AudioBuffer>> = {}
  let hum: { source: AudioBufferSourceNode; gain: GainNode } | null = null
  let lastTick = -Infinity

  function setGains(immediately: boolean) {
    if (!ctx) return
    const set = (gain: GainNode, value: number) => {
      if (immediately) gain.gain.value = value
      else gain.gain.setTargetAtTime(value, ctx!.currentTime, 0.01)
    }
    set(master, volumeGain(settings.volume))
    set(effects, settings.effects ? 1 : 0)
    set(music, settings.music ? 1 : 0)
  }

  function load() {
    if (loading) return
    loading = true
    for (const name of ['on', 'hum', 'off'] as const) {
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
      play('on')
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
      if (now - lastTick < minTickGap - 1e-9) return
      lastTick = now
      // Louder the slower the wheel.
      const level = 0.2 + 0.6 * (1 - Math.min(Math.max(share, 0), 1))
      const out = ctx.createGain()
      out.gain.setValueAtTime(level, now)
      out.gain.exponentialRampToValueAtTime(0.001, now + 0.03)
      out.connect(effects)
      const click = ctx.createBufferSource()
      click.buffer = noise
      const filter = ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.value = 2800
      filter.Q.value = 1.2
      click.connect(filter)
      filter.connect(out)
      click.start(now)
      const tone = ctx.createOscillator()
      tone.type = 'triangle'
      tone.frequency.setValueAtTime(1900, now)
      tone.frequency.exponentialRampToValueAtTime(600, now + 0.025)
      tone.connect(out)
      tone.start(now)
      tone.stop(now + 0.03)
    },
    spinEnd() {
      if (!ctx) return
      stopHum()
      play('off')
    },
  }
}
