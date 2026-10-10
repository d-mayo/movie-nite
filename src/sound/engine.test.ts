import { describe, expect, test } from 'vitest'
import { fakeAudio, type FakeGain } from '../test/fakeAudio.ts'
import {
  createSound,
  humLoopEnd,
  humLoopStart,
  minHumRate,
  silentSound,
  volumeGain,
  type SoundEngine,
} from './engine.ts'

// A started engine on fake audio, with the files decoded.
async function ready(engine?: (e: SoundEngine) => void) {
  const audio = fakeAudio()
  const sound = createSound(audio.deps)
  const detach = sound.attach(document)
  engine?.(sound)
  document.dispatchEvent(new Event('pointerup'))
  await audio.finishLoads()
  return { ...audio, sound, detach }
}

describe('unlocking on a gesture', () => {
  test('nothing is made before a gesture; a pointerup creates, resumes and loads once', async () => {
    const audio = fakeAudio()
    const sound = createSound(audio.deps)
    const detach = sound.attach(document)
    expect(audio.contexts).toHaveLength(0)
    expect(audio.loaded).toEqual([])
    document.dispatchEvent(new Event('pointerup'))
    expect(audio.contexts).toHaveLength(1)
    expect(audio.ctx.resumes).toBe(1)
    expect(audio.loaded).toEqual(['on', 'hum', 'off'])
    detach()
  })

  test.each(['pointerdown', 'keydown', 'touchend'])('a %s unlocks too', (type) => {
    const audio = fakeAudio()
    const detach = createSound(audio.deps).attach(document)
    document.dispatchEvent(new Event(type))
    expect(audio.contexts).toHaveLength(1)
    detach()
  })

  test('a later gesture resumes a suspended context again without loading twice', () => {
    const audio = fakeAudio()
    const detach = createSound(audio.deps).attach(document)
    document.dispatchEvent(new Event('pointerdown'))
    audio.ctx.state = 'suspended'
    document.dispatchEvent(new Event('keydown'))
    expect(audio.contexts).toHaveLength(1)
    expect(audio.ctx.resumes).toBe(2)
    expect(audio.loaded).toHaveLength(3)
    detach()
  })

  test('attach, detach and attach again leaves one set of listeners and one load', () => {
    const audio = fakeAudio()
    const sound = createSound(audio.deps)
    sound.attach(document)()
    const detach = sound.attach(document)
    document.dispatchEvent(new Event('pointerup'))
    expect(audio.contexts).toHaveLength(1)
    expect(audio.loaded).toHaveLength(3)
    detach()
    document.dispatchEvent(new Event('keydown'))
    expect(audio.ctx.resumes).toBe(1)
  })

  test('with no Web Audio every call is a no-op that does not throw', () => {
    for (const sound of [silentSound, createSound({ createContext: () => null, load: () => Promise.reject() })]) {
      const detach = sound.attach(document)
      document.dispatchEvent(new Event('pointerup'))
      sound.apply({ music: true, effects: true, volume: 50 })
      sound.spinStart()
      sound.spinSpeed(0.5, 1)
      sound.pinTick(0.5)
      sound.spinEnd()
      detach()
    }
  })

  test('a switch-on cued before its file decodes plays nothing', async () => {
    const audio = fakeAudio()
    const sound = createSound(audio.deps)
    const detach = sound.attach(document)
    document.dispatchEvent(new Event('pointerup'))
    expect(() => sound.spinStart()).not.toThrow()
    expect(audio.ctx.sources).toHaveLength(0)
    await audio.finishLoads()
    detach()
  })
})

describe('the settings', () => {
  test('master gain is the square of the volume; the buses follow their switches', async () => {
    const { ctx, sound } = await ready((s) => s.apply({ music: true, effects: false, volume: 70 }))
    expect(ctx.master.gain.value).toBeCloseTo(0.49)
    expect(ctx.effects.gain.value).toBe(0)
    expect(ctx.music.gain.value).toBe(1)
    sound.apply({ music: false, effects: true, volume: 0 })
    expect(ctx.master.gain.value).toBe(0)
    expect(ctx.effects.gain.value).toBe(1)
    expect(ctx.music.gain.value).toBe(0)
    expect(volumeGain(100)).toBe(1)
  })

  test('the buses feed the master gain, which feeds the destination', async () => {
    const { ctx } = await ready()
    expect(ctx.effects.reaches(ctx.master)).toBe(true)
    expect(ctx.music.reaches(ctx.master)).toBe(true)
    expect(ctx.master.reaches(ctx.destination)).toBe(true)
  })
})

describe('the projector', () => {
  test('spinStart plays the switch-on and a looping hum on the effects bus', async () => {
    const { ctx, sound } = await ready()
    sound.spinStart()
    const [on] = ctx.sourcesOf('on')
    const [hum] = ctx.sourcesOf('hum')
    expect(on.started).not.toBeNull()
    expect(on.reaches(ctx.effects)).toBe(true)
    expect(hum.loop).toBe(true)
    expect(hum.loopStart).toBe(humLoopStart)
    expect(hum.loopStart).toBeGreaterThan(0)
    expect(hum.loopEnd).toBe(humLoopEnd)
    expect(hum.loopEnd).toBeLessThan(hum.buffer!.duration)
    expect(hum.reaches(ctx.effects)).toBe(true)
    expect(hum.started?.offset).toBe(humLoopStart)
  })

  test('the hum falls with the wheel but keeps a floor until the last moment', async () => {
    const { ctx, sound } = await ready()
    sound.spinStart()
    const [hum] = ctx.sourcesOf('hum')
    const gain = hum.out[0] as FakeGain
    sound.spinSpeed(1, 5)
    const fastRate = hum.playbackRate.value
    const fastGain = gain.gain.value
    sound.spinSpeed(0.3, 5)
    const slowRate = hum.playbackRate.value
    const slowGain = gain.gain.value
    sound.spinSpeed(0, 5)
    expect(fastRate).toBe(1)
    expect(slowRate).toBeLessThan(fastRate)
    expect(slowGain).toBeLessThan(fastGain)
    expect(hum.playbackRate.value).toBeCloseTo(minHumRate)
    expect(gain.gain.value).toBeGreaterThan(0.2)
    sound.spinSpeed(0, 0.15)
    expect(gain.gain.value).toBeGreaterThan(0)
    expect(gain.gain.value).toBeLessThan(slowGain)
    sound.spinSpeed(0, 0)
    expect(gain.gain.value).toBe(0)
  })

  test('spinEnd stops the hum and plays the switch-off', async () => {
    const { ctx, sound } = await ready()
    sound.spinStart()
    sound.spinEnd()
    const [hum] = ctx.sourcesOf('hum')
    expect(hum.stoppedAt).not.toBeNull()
    const [off] = ctx.sourcesOf('off')
    expect(off.started).not.toBeNull()
    expect(off.reaches(ctx.effects)).toBe(true)
  })

  test('speed calls without a spin do nothing', async () => {
    const { ctx, sound } = await ready()
    sound.spinSpeed(0.5, 1)
    sound.spinEnd()
    expect(ctx.sources).toHaveLength(1) // the switch-off
  })
})

describe('the pin ticks', () => {
  test('a tick is a noise burst and a triangle tone on the effects bus', async () => {
    const { ctx, sound } = await ready()
    sound.pinTick(0.5)
    expect(ctx.sources).toHaveLength(1)
    expect(ctx.oscillators).toHaveLength(1)
    expect(ctx.oscillators[0].type).toBe('triangle')
    expect(ctx.oscillators[0].reaches(ctx.effects)).toBe(true)
    expect(ctx.sources[0].reaches(ctx.effects)).toBe(true)
  })

  test('no tick follows another within 30 ms on the audio clock', async () => {
    const { ctx, sound } = await ready()
    for (let ms = 0; ms <= 100; ms += 10) {
      ctx.currentTime = ms / 1000
      sound.pinTick(0.5)
    }
    const starts = ctx.oscillators.map((o) => o.started!.when!)
    expect(starts.length).toBeGreaterThan(3)
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(0.03 - 1e-9)
    }
  })

  test('requests faster than the gap give a steady tick rate, not an uneven one', async () => {
    const { ctx, sound } = await ready()
    // A pin every 9 ms for a second, seen by frames 16 ms apart.
    for (let ms = 0; ms <= 1000; ms += 16) {
      ctx.currentTime = ms / 1000
      sound.pinTick(0.5)
      sound.pinTick(0.5)
    }
    const starts = ctx.oscillators.map((o) => o.started!.when!)
    const gaps = starts.slice(1).map((s, i) => s - starts[i])
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(0.03 - 1e-9)
    expect(Math.max(...gaps)).toBeLessThan(0.04)
    expect(starts.length).toBeGreaterThan(28)
  })

  test('a tick at a low speed is louder than one at a high speed', async () => {
    const { ctx, sound } = await ready()
    const level = () => ctx.gains.at(-1)!.gain.sets[0]
    sound.pinTick(0.9)
    const fast = level()
    ctx.currentTime = 1
    sound.pinTick(0.1)
    expect(level()).toBeGreaterThan(fast)
  })
})
