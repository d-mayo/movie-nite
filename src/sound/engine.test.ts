import { describe, expect, test } from 'vitest'
import { fakeAudio, type FakeGain } from '../test/fakeAudio.ts'
import {
  bedLevel,
  cheerLevel,
  createSound,
  dipLevel,
  drumrollLoopStart,
  humLoopEnd,
  humLoopStart,
  loopEnd,
  loopLevel,
  loopStart,
  minHumRate,
  musicFadeSeconds,
  silentSound,
  volumeGain,
  type SoundEngine,
  type SoundName,
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
    expect(audio.loaded).toEqual(['on', 'hum', 'off', 'loop', 'stinger', 'applause', 'gasp', 'drumroll', 'cymbal', 'cheer'])
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
    expect(audio.loaded).toHaveLength(10)
    detach()
  })

  test('attach, detach and attach again leaves one set of listeners and one load', () => {
    const audio = fakeAudio()
    const sound = createSound(audio.deps)
    sound.attach(document)()
    const detach = sound.attach(document)
    document.dispatchEvent(new Event('pointerup'))
    expect(audio.contexts).toHaveLength(1)
    expect(audio.loaded).toHaveLength(10)
    detach()
    document.dispatchEvent(new Event('keydown'))
    expect(audio.ctx.resumes).toBe(1)
  })

  test('with no Web Audio every call is a no-op that does not throw', () => {
    for (const sound of [silentSound, createSound({ createContext: () => null, load: () => Promise.reject() })]) {
      const detach = sound.attach(document)
      document.dispatchEvent(new Event('pointerup'))
      sound.apply({ music: 100, effects: 100, volume: 50, muted: false })
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
  test('the buses follow their levels, which cannot pass the volume; the master is on unless muted', async () => {
    const { ctx, sound } = await ready((s) => s.apply({ music: 100, effects: 0, volume: 70, muted: false }))
    expect(ctx.master.gain.value).toBe(1)
    expect(ctx.effects.gain.value).toBe(0)
    expect(ctx.music.gain.value).toBeCloseTo(0.49)
    sound.apply({ music: 0, effects: 100, volume: 0, muted: false })
    expect(ctx.effects.gain.value).toBe(0)
    expect(ctx.music.gain.value).toBe(0)
    sound.apply({ music: 30, effects: 100, volume: 100, muted: false })
    expect(ctx.effects.gain.value).toBe(1)
    expect(ctx.music.gain.value).toBeCloseTo(0.09)
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

describe('the music', () => {
  test('loaded and routed to the music bus only', async () => {
    const { ctx, sound } = await ready()
    sound.spinStart()
    const [loop] = ctx.sourcesOf('loop')
    expect(loop.loop).toBe(true)
    expect(loop.loopStart).toBe(loopStart)
    expect(loop.loopStart).toBeGreaterThan(0)
    expect(loop.loopEnd).toBe(loopEnd)
    expect(loop.loopEnd).toBeLessThan(loop.buffer!.duration)
    expect(loop.started?.offset).toBe(0)
    expect(loop.reaches(ctx.music)).toBe(true)
    expect(loop.reaches(ctx.effects)).toBe(false)
    expect((loop.out[0] as FakeGain).gain.value).toBe(loopLevel)
  })

  test('a spin before the loop has decoded plays no music, and one decoding mid-spin starts nothing', async () => {
    const audio = fakeAudio()
    const sound = createSound(audio.deps)
    const detach = sound.attach(document)
    document.dispatchEvent(new Event('pointerup'))
    sound.spinStart()
    expect(audio.ctx.sourcesOf('loop')).toHaveLength(0)
    await audio.finishLoads()
    expect(audio.ctx.sourcesOf('loop')).toHaveLength(0)
    detach()
  })

  test('landing plays the stinger with the hit on the reveal, then the applause, and dips and settles the loop by ramps', async () => {
    const { ctx, sound } = await ready()
    sound.spinStart()
    const loopGain = ctx.sourcesOf('loop')[0].out[0] as FakeGain
    ctx.currentTime = 5
    sound.landed(0.65)
    const [stinger] = ctx.sourcesOf('stinger')
    const [applause] = ctx.sourcesOf('applause')
    expect(stinger.reaches(ctx.music)).toBe(true)
    expect(stinger.reaches(ctx.effects)).toBe(false)
    // The swell starts now, into the file; its hit falls 0.65 s later.
    expect(stinger.started?.when).toBeCloseTo(5)
    expect(stinger.started?.offset).toBeCloseTo(1.0)
    expect(applause.started?.when).toBeCloseTo(5.65)
    const ramps = loopGain.gain.calls.filter((c) => c.method === 'linearRampToValueAtTime')
    expect(ramps.map((c) => c.value)).toEqual([dipLevel, bedLevel])
    expect(dipLevel).toBeLessThan(bedLevel)
    expect(bedLevel).toBeLessThan(loopLevel)
    // The only jumps are setting the ramps' starting points.
    expect(loopGain.gain.calls.filter((c) => c.method === 'setTargetAtTime')).toEqual([])
  })

  test('with no hold the stinger starts at its hit', async () => {
    const { ctx, sound } = await ready()
    sound.spinStart()
    ctx.currentTime = 2
    sound.landed(0)
    const [stinger] = ctx.sourcesOf('stinger')
    expect(stinger.started?.when).toBeCloseTo(2)
    expect(stinger.started?.offset).toBeCloseTo(1.65)
    expect(ctx.sourcesOf('applause')[0].started?.when).toBeCloseTo(2)
  })

  test('the stinger and the applause are skipped if not loaded; the loop still ramps to the bed', async () => {
    const audio = fakeAudio()
    const deps = {
      ...audio.deps,
      load: (name: SoundName) =>
        name === 'stinger' || name === 'applause'
          ? Promise.reject(new Error('missing'))
          : audio.deps.load(name),
    }
    const sound = createSound(deps)
    const detach = sound.attach(document)
    document.dispatchEvent(new Event('pointerup'))
    await audio.finishLoads()
    sound.spinStart()
    sound.landed(0.65)
    const gain = audio.ctx.sourcesOf('loop')[0].out[0] as FakeGain
    expect(audio.ctx.sourcesOf('stinger')).toHaveLength(0)
    expect(audio.ctx.sourcesOf('applause')).toHaveLength(0)
    expect(gain.gain.calls.filter((c) => c.method === 'linearRampToValueAtTime')).toEqual([
      { method: 'linearRampToValueAtTime', value: bedLevel },
    ])
    detach()
  })

  test('revealClosed fades the loop out evenly over a couple of seconds and stops it; the win sounds fade with it', async () => {
    const { ctx, sound } = await ready()
    sound.spinStart()
    sound.landed(0.65)
    const [loop] = ctx.sourcesOf('loop')
    const gain = loop.out[0] as FakeGain
    ctx.currentTime = 7
    sound.revealClosed()
    const methods = gain.gain.calls.map((c) => c.method)
    expect(methods.at(-2)).toBe('exponentialRampToValueAtTime')
    expect(gain.gain.calls.at(-1)).toEqual({ method: 'setValueAtTime', value: 0 })
    expect(musicFadeSeconds).toBeGreaterThanOrEqual(1.5)
    expect(loop.stoppedAt! - 7).toBeGreaterThanOrEqual(musicFadeSeconds)
    expect(loop.stoppedAt! - 7).toBeLessThan(musicFadeSeconds + 0.2)
    for (const name of ['stinger', 'applause'] as const) {
      const stopped = ctx.sourcesOf(name)[0].stoppedAt!
      expect(stopped - 7).toBeGreaterThanOrEqual(musicFadeSeconds)
      expect(stopped - 7).toBeLessThan(musicFadeSeconds + 0.2)
    }
  })

  test('a new spin stops the old loop and starts one', async () => {
    const { ctx, sound } = await ready()
    sound.spinStart()
    sound.revealClosed()
    sound.spinStart()
    const loops = ctx.sourcesOf('loop')
    expect(loops).toHaveLength(2)
    expect(loops[0].stoppedAt).not.toBeNull()
    expect(loops[1].stoppedAt).toBeNull()
  })

  test('revealClosed with nothing playing does nothing', async () => {
    const { ctx, sound } = await ready()
    expect(() => sound.revealClosed()).not.toThrow()
    expect(ctx.sources).toHaveLength(0)
  })

  test('Music and Effects are levels, each scaling its own bus', async () => {
    const { ctx, sound } = await ready()
    sound.apply({ music: 0, effects: 100, volume: 100, muted: false })
    expect(ctx.music.gain.value).toBe(0)
    expect(ctx.effects.gain.value).toBe(1)
    sound.apply({ music: 50, effects: 0, volume: 100, muted: false })
    expect(ctx.music.gain.value).toBeCloseTo(0.25)
    expect(ctx.effects.gain.value).toBe(0)
  })

  test('the applause rides the effects bus, the stinger the music bus', async () => {
    const { ctx, sound } = await ready()
    sound.spinStart()
    sound.landed(0.65)
    const [applause] = ctx.sourcesOf('applause')
    const [stinger] = ctx.sourcesOf('stinger')
    expect(applause.reaches(ctx.effects)).toBe(true)
    expect(applause.reaches(ctx.music)).toBe(false)
    expect(stinger.reaches(ctx.music)).toBe(true)
    expect(stinger.reaches(ctx.effects)).toBe(false)
  })
})

describe('the close call', () => {
  test('the cue drops the loop by a ramp without stopping it, and starts the gasp and the drumroll on the effects bus', async () => {
    const { ctx, sound } = await ready()
    sound.spinStart()
    const [loop] = ctx.sourcesOf('loop')
    const gain = loop.out[0] as FakeGain
    ctx.currentTime = 3
    sound.closeCall(2.9)
    const ramps = gain.gain.calls.filter((c) => c.method === 'linearRampToValueAtTime')
    expect(ramps.at(-1)!.value).toBe(0)
    expect(gain.gain.calls.filter((c) => c.method === 'setTargetAtTime')).toEqual([])
    expect(loop.stoppedAt).toBeNull()
    const [gasp] = ctx.sourcesOf('gasp')
    const [roll] = ctx.sourcesOf('drumroll')
    for (const source of [gasp, roll]) {
      expect(source.started).not.toBeNull()
      expect(source.reaches(ctx.effects)).toBe(true)
      expect(source.reaches(ctx.music)).toBe(false)
    }
    // The drumroll starts at the cue and loops through the whole approach, fading in from silence.
    expect(roll.started?.when).toBe(3)
    expect(roll.loop).toBe(true)
    expect(roll.loopStart).toBe(drumrollLoopStart)
    expect(roll.loopEnd).toBeLessThan(roll.buffer!.duration)
    expect((roll.out[0] as FakeGain).gain.calls[0]).toEqual({ method: 'setValueAtTime', value: 0 })
    // The drumroll builds by a ramp.
    const rollGain = roll.out[0] as FakeGain
    expect(rollGain.gain.calls.at(-1)!.method).toBe('linearRampToValueAtTime')
    expect(rollGain.gain.calls.at(-1)!.value).toBeGreaterThan(rollGain.gain.calls[0].value)
  })

  test('the close-call landing ends the drumroll, crashes the cymbal, plays a cheer over the applause and brings the loop back to the bed after the stinger', async () => {
    const { ctx, sound } = await ready()
    sound.spinStart()
    const loopGain = ctx.sourcesOf('loop')[0].out[0] as FakeGain
    ctx.currentTime = 3
    sound.closeCall(2.9)
    ctx.currentTime = 5.9
    sound.landed(2, true)
    const [roll] = ctx.sourcesOf('drumroll')
    expect(roll.stoppedAt!).toBeGreaterThan(5.9)
    expect(roll.stoppedAt!).toBeLessThan(6.1)
    const [cymbal] = ctx.sourcesOf('cymbal')
    expect(cymbal.started?.when).toBeUndefined()
    expect(cymbal.reaches(ctx.effects)).toBe(true)
    expect(cymbal.reaches(ctx.music)).toBe(false)
    // The stinger's hit lands as the reveal opens, 2 s on, on the music bus.
    const [stinger] = ctx.sourcesOf('stinger')
    expect(stinger.started!.when! + (1.65 - stinger.started!.offset!)).toBeCloseTo(7.9)
    expect(stinger.reaches(ctx.music)).toBe(true)
    expect(stinger.reaches(ctx.effects)).toBe(false)
    const [applause] = ctx.sourcesOf('applause')
    const [cheer] = ctx.sourcesOf('cheer')
    expect((applause.out[0] as FakeGain).gain.value).toBe(0.7)
    expect((cheer.out[0] as FakeGain).gain.value).toBe(cheerLevel)
    expect(cheer.started?.when).toBeCloseTo(7.9)
    expect(cheer.reaches(ctx.effects)).toBe(true)
    expect(cheer.reaches(ctx.music)).toBe(false)
    // The loop's last change is a ramp up to the bed, after the stinger starts.
    const calls = loopGain.gain.calls
    expect(calls.at(-1)).toEqual({ method: 'linearRampToValueAtTime', value: bedLevel })
    expect(calls.filter((c) => c.method === 'setTargetAtTime')).toEqual([])
  })

  test('a missing gasp, drumroll or cymbal never stops the rest', async () => {
    for (const missing of ['gasp', 'drumroll', 'cymbal', 'cheer'] as const) {
      const audio = fakeAudio()
      const deps = {
        ...audio.deps,
        load: (name: SoundName) => (name === missing ? Promise.reject(new Error('missing')) : audio.deps.load(name)),
      }
      const sound = createSound(deps)
      const detach = sound.attach(document)
      document.dispatchEvent(new Event('pointerup'))
      await audio.finishLoads()
      sound.spinStart()
      expect(() => {
        sound.closeCall(2.9)
        sound.landed(2, true)
      }).not.toThrow()
      expect(audio.ctx.sourcesOf('stinger')).toHaveLength(1)
      expect(audio.ctx.sourcesOf('applause')).toHaveLength(1)
      expect(audio.ctx.sourcesOf(missing)).toHaveLength(0)
      detach()
    }
  })

  test('an ordinary landing plays no gasp, drumroll or cymbal, with the usual applause level, dip and bed', async () => {
    const { ctx, sound } = await ready()
    sound.spinStart()
    sound.landed(0.65)
    for (const name of ['gasp', 'drumroll', 'cymbal', 'cheer'] as const) expect(ctx.sourcesOf(name)).toHaveLength(0)
    expect((ctx.sourcesOf('applause')[0].out[0] as FakeGain).gain.value).toBe(0.7)
  })

  test('the engine is safe before a gesture', () => {
    const sound = createSound(fakeAudio().deps)
    expect(() => {
      sound.closeCall(1)
      sound.landed(1, true)
    }).not.toThrow()
  })
})
