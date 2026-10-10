import type { SoundDeps, SoundName } from '../sound/engine.ts'

// A recording stand-in for the Web Audio objects the sound engine uses. Gains
// are listed in creation order: master, effects, music, then any made later.
export class FakeParam {
  value: number
  // Every value set, by any method, in order.
  sets: number[] = []
  constructor(value = 0) {
    this.value = value
  }
  private set(value: number) {
    this.value = value
    this.sets.push(value)
  }
  setTargetAtTime(value: number) {
    this.set(value)
  }
  setValueAtTime(value: number) {
    this.set(value)
  }
  exponentialRampToValueAtTime(value: number) {
    this.set(value)
  }
}

export class FakeNode {
  out: FakeNode[] = []
  connect(node: FakeNode) {
    this.out.push(node)
    return node
  }
  // Whether this node's output reaches `target`.
  reaches(target: FakeNode): boolean {
    return this.out.some((node) => node === target || node.reaches(target))
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
}

// The decoded length of each file, in seconds.
export const fakeDurations: Record<SoundName, number> = { on: 0.66, hum: 8.2, off: 0.77 }

export class FakeContext {
  state = 'suspended'
  currentTime = 0
  sampleRate = 44100
  resumes = 0
  destination = new FakeNode()
  gains: FakeGain[] = []
  sources: FakeSource[] = []
  oscillators: FakeOscillator[] = []
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
  // The sources made from a decoded file, by its name.
  sourcesOf(name: SoundName) {
    return this.sources.filter((s) => s.buffer?.duration === fakeDurations[name])
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
