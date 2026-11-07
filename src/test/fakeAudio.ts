import type { SoundDeps, SoundName } from '../sound/engine.ts'

// A recording stand-in for the Web Audio objects the sound engine uses. Gains
// are listed in creation order: master, effects, music, then any made later.
export class FakeParam {
  value: number
  // Every value set, by any method, in order.
  sets: number[] = []
  // The same, with the method that set each.
  calls: { method: string; value: number }[] = []
  // The same again with the time each was scheduled for, where it was given.
  timed: { method: string; value: number; at: number | undefined }[] = []
  constructor(value = 0) {
    this.value = value
  }
  private set(method: string, value: number, at?: number) {
    this.timed.push({ method, value, at })
    this.value = value
    this.sets.push(value)
    this.calls.push({ method, value })
  }
  setTargetAtTime(value: number) {
    this.set('setTargetAtTime', value)
  }
  setValueAtTime(value: number, at?: number) {
    this.set('setValueAtTime', value, at)
  }
  exponentialRampToValueAtTime(value: number, at?: number) {
    this.set('exponentialRampToValueAtTime', value, at)
  }
  linearRampToValueAtTime(value: number, at?: number) {
    this.set('linearRampToValueAtTime', value, at)
  }
  cancelScheduledValues() {}
  // A param is the end of a path, never a node that reaches another.
  reaches() {
    return false
  }
}

export class FakeNode {
  out: FakeNode[] = []
  connect(node: FakeNode) {
    this.out.push(node)
    return node
  }
  disconnect() {
    this.out = []
  }
  // Whether this node's output reaches `target`.
  reaches(target: FakeNode, seen = new Set<FakeNode>()): boolean {
    if (seen.has(this)) return false
    seen.add(this)
    return this.out.some((node) => node === target || node.reaches(target, seen))
  }
}

export class FakeGain extends FakeNode {
  gain = new FakeParam(1)
}

export class FakeBuffer {
  duration: number
  length: number
  constructor(duration: number, length = 0) {
    this.duration = duration
    this.length = length
  }
  getChannelData() {
    return new Float32Array(this.length)
  }
}

export class FakeSource extends FakeNode {
  buffer: FakeBuffer | null = null
  loop = false
  loopStart = 0
  loopEnd = 0
  playbackRate = new FakeParam(1)
  detune = new FakeParam(0)
  started: { when: number | undefined; offset: number | undefined } | null = null
  stoppedAt: number | null = null
  start(when?: number, offset?: number) {
    this.started = { when, offset }
  }
  stop(when = 0) {
    this.stoppedAt = when
  }
}

export class FakeOscillator extends FakeSource {
  type = ''
  frequency = new FakeParam(440)
}

export class FakeFilter extends FakeNode {
  type = ''
  frequency = new FakeParam(350)
  Q = new FakeParam(1)
  gain = new FakeParam(0)
}

export class FakeDelay extends FakeNode {
  delayTime = new FakeParam(0)
}

export class FakeShaper extends FakeNode {
  curve: Float32Array | null = null
}

// The decoded length of each file, in seconds.
export const fakeDurations: Record<SoundName, number> = {
  on: 0.66,
  hum: 8.2,
  off: 0.77,
  loop: 32.22,
  stinger: 3.03,
  applause: 6.19,
  gasp: 2.05,
  drumroll: 1.8,
  cymbal: 2.23,
  cheer: 7,
  dloop: 32.32,
  ambience: 60.64,
  runout: 3.3,
  clunk: 0.45,
  clap: 2.3,
  knock: 0.3,
  'christmas-loop': 30.1,
  'christmas-stinger': 3.5,
  'christmas-win-1': 2.5,
  'christmas-win-2': 3,
  'christmas-win-3': 3.5,
  'christmas-win-4': 4,
  'christmas-bells': 4.4,
}

export class FakeContext {
  state = 'suspended'
  currentTime = 0
  sampleRate = 44100
  resumes = 0
  destination = new FakeNode()
  gains: FakeGain[] = []
  sources: FakeSource[] = []
  oscillators: FakeOscillator[] = []
  shapers: FakeShaper[] = []
  createGain() {
    const gain = new FakeGain()
    this.gains.push(gain)
    return gain
  }
  createBuffer(_channels: number, length: number) {
    return new FakeBuffer(length / this.sampleRate, length)
  }
  createBufferSource() {
    const source = new FakeSource()
    this.sources.push(source)
    return source
  }
  createOscillator() {
    const oscillator = new FakeOscillator()
    this.oscillators.push(oscillator)
    return oscillator
  }
  createBiquadFilter() {
    return new FakeFilter()
  }
  createDelay() {
    return new FakeDelay()
  }
  createWaveShaper() {
    const shaper = new FakeShaper()
    this.shapers.push(shaper)
    return shaper
  }
  resume() {
    this.resumes++
    this.state = 'running'
    return Promise.resolve()
  }
  // A file's bytes are its duration in centiseconds.
  decodeAudioData(data: ArrayBuffer) {
    return Promise.resolve(new FakeBuffer(data.byteLength / 100))
  }
  get master() {
    return this.gains[0]
  }
  get effects() {
    return this.gains[1]
  }
  get music() {
    return this.gains[2]
  }
  // Whether a source is a live twin or ambience chain's, told by its route and rate: the twin's source reaches a
  // wave shaper, the ambience's runs at half speed, and the ambience's hum reaches the music bus (the projector's
  // reaches only the effects bus).
  isLive(source: FakeSource) {
    const duration = source.buffer?.duration
    if (duration === fakeDurations.hum) return source.reaches(this.music)
    // Only the loops are made live; the win sounds reach a shaper too, through the film-reel chain.
    if (duration !== fakeDurations.loop && duration !== fakeDurations['christmas-loop']) return false
    return source.playbackRate.value === 0.5 || this.shapers.some((shaper) => source.reaches(shaper))
  }
  // The plain sources made from a decoded file, by its name: not the live twin's or ambience's.
  sourcesOf(name: SoundName) {
    return this.sources.filter((s) => s.buffer?.duration === fakeDurations[name] && !this.isLive(s))
  }
  // The live twin's or ambience's sources made from a decoded file.
  liveOf(name: SoundName) {
    return this.sources.filter((s) => s.buffer?.duration === fakeDurations[name] && this.isLive(s))
  }
  // The live twins: the loop's own buffer through a worn-reel chain.
  twinsOf(name: SoundName) {
    return this.liveOf(name).filter((s) => s.playbackRate.value !== 0.5)
  }
  // The live ambiences: the loop's buffer at half speed.
  ambiencesOf(name: SoundName) {
    return this.liveOf(name).filter((s) => s.playbackRate.value === 0.5)
  }
  // The last gain before the music bus on a source's way there (an ambience's level, which swells and ducks).
  bedGainOf(source: FakeSource): FakeGain {
    const seen = new Set<FakeNode>()
    const walk = (node: FakeNode): FakeGain | null => {
      if (seen.has(node)) return null
      seen.add(node)
      if (node instanceof FakeGain && node.out.includes(this.music)) return node
      for (const next of node.out) {
        const found = walk(next)
        if (found) return found
      }
      return null
    }
    return walk(source)!
  }
}

// A sound-engine dependency set on fake audio: the contexts made, the files
// asked for, and `finishLoads` to let the pending decodes settle.
export function fakeAudio() {
  const contexts: FakeContext[] = []
  const loaded: SoundName[] = []
  const deps: SoundDeps = {
    createContext() {
      const ctx = new FakeContext()
      contexts.push(ctx)
      return ctx as unknown as AudioContext
    },
    load(name) {
      loaded.push(name)
      return Promise.resolve(new ArrayBuffer(Math.round(fakeDurations[name] * 100)))
    },
  }
  return {
    deps,
    contexts,
    loaded,
    // The first context.
    get ctx() {
      return contexts[0]
    },
    // Lets the loads and decodes settle.
    finishLoads: () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
  }
}
