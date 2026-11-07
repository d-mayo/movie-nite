import { describe, expect, test } from 'vitest'
import { fakeAudio, fakeDurations, type FakeGain } from '../test/fakeAudio.ts'
import { bedLevel, createSound, dipLevel, loopEnd, loopStart, minBellsGain, stingerHit, type SoundEngine, type SoundName } from './engine.ts'
import type { SoundSets } from './seasons.ts'

// A set whose figures differ from the march's.
const testSets: SoundSets = {
  christmas: {
    loop: { name: 'christmas-loop', loopStart: 3, loopEnd: 20, length: 30.1 },
    stinger: { name: 'christmas-stinger', hit: 1, seconds: 3.5 },
    win: { name: 'christmas-win', length: 2.5 },
    bells: { name: 'christmas-bells', loopStart: 0.2, loopEnd: 4, length: 4.4 },
  },
}

// A started engine on fake audio; `before` runs before the first gesture.
async function ready(before?: (e: SoundEngine) => void, sets: SoundSets = testSets) {
  const audio = fakeAudio()
  const sound = createSound({ ...audio.deps, sets })
  sound.attach(document)
  before?.(sound)
  document.dispatchEvent(new Event('pointerup'))
  await audio.finishLoads()
  return { ...audio, sound }
}

const base = ['on', 'hum', 'off', 'loop', 'stinger', 'applause', 'gasp', 'drumroll', 'cymbal', 'cheer', 'dloop', 'ambience', 'runout', 'clunk', 'clap', 'knock']
const christmas: SoundName[] = ['christmas-loop', 'christmas-stinger', 'christmas-win', 'christmas-bells']

// An engine whose seasonal files load only when `allow` says so (a rejected load is a file that never decodes).
function withFiles(allow: (name: SoundName) => boolean) {
  const audio = fakeAudio()
  const sound = createSound({
    ...audio.deps,
    sets: testSets,
    load: (name) => (!christmas.includes(name) || allow(name) ? audio.deps.load(name) : Promise.reject(new Error('no file'))),
  })
  sound.attach(document)
  return { audio, sound }
}

describe('a set owns its figures', () => {
  test('the loop plays by the set points and the stinger timing comes from its hit and length', async () => {
    const { ctx, sound } = await ready((s) => s.setSeason('christmas'))
    sound.spinStart()
    const [loop] = ctx.sourcesOf('christmas-loop')
    expect(loop.loopStart).toBe(3)
    expect(loop.loopEnd).toBe(20)
    expect(ctx.sourcesOf('loop')).toHaveLength(0)
    ctx.currentTime = 10
    sound.landed(5)
    const [stinger] = ctx.sourcesOf('christmas-stinger')
    expect(stinger.started?.when).toBeCloseTo(14)
    expect(stinger.started?.offset).toBeCloseTo(0)
    // The dip ends as the set's stinger does: 10 + 5 - 1 + 3.5 = 17.5, back to the bed from 17.
    const gain = loop.out[0] as FakeGain
    const back = gain.gain.timed.filter((c) => c.method === 'linearRampToValueAtTime' && c.value === bedLevel)
    expect(back.at(-1)?.at).toBeCloseTo(17.5)
    expect(gain.gain.timed.some((c) => c.method === 'setValueAtTime' && c.value === dipLevel && c.at === 17)).toBe(true)
  })

  test('the march is a set too: with no season the figures are its own', async () => {
    const { ctx, sound } = await ready()
    sound.spinStart()
    const [loop] = ctx.sourcesOf('loop')
    expect(loop.loopStart).toBe(loopStart)
    expect(loop.loopEnd).toBe(loopEnd)
    sound.landed(0)
    expect(ctx.sourcesOf('stinger')[0].started?.offset).toBeCloseTo(stingerHit)
  })
})

describe('lazy loading', () => {
  test('with no season only the base files load, and setSeason after the unlock loads each part once', async () => {
    const { loaded, sound } = await ready()
    expect(loaded).toEqual(base)
    sound.setSeason('christmas')
    expect(loaded).toEqual([...base, ...christmas])
    sound.setSeason(null)
    sound.setSeason('christmas')
    expect(loaded).toEqual([...base, ...christmas])
  })

  test('a season set before the first gesture loads nothing until the unlock', () => {
    const audio = fakeAudio()
    const sound = createSound({ ...audio.deps, sets: testSets })
    sound.attach(document)
    sound.setSeason('christmas')
    expect(audio.loaded).toEqual([])
    document.dispatchEvent(new Event('pointerup'))
    expect(audio.loaded).toEqual([...base, ...christmas])
  })

  test('a season with no set loads nothing', async () => {
    const { loaded, sound } = await ready((s) => s.setSeason('halloween'))
    sound.setSeason('valentines')
    expect(loaded).toEqual(base)
  })
})

describe('falling back part by part', () => {
  test('until the files decode the march plays whole, and a loop playing keeps its figures when they arrive', async () => {
    let open = false
    const gates: (() => void)[] = []
    const audio = fakeAudio()
    const sound = createSound({
      ...audio.deps,
      sets: testSets,
      load: (name) =>
        christmas.includes(name) && !open
          ? new Promise((resolve) => gates.push(() => resolve(new ArrayBuffer(Math.round(fakeDurations[name] * 100)))))
          : audio.deps.load(name),
    })
    sound.attach(document)
    sound.setSeason('christmas')
    document.dispatchEvent(new Event('pointerup'))
    await audio.finishLoads()
    const ctx = audio.ctx
    sound.spinStart()
    expect(ctx.sourcesOf('loop')).toHaveLength(1)
    expect(ctx.sourcesOf('christmas-bells')).toHaveLength(0)
    open = true
    for (const g of gates) g()
    await audio.finishLoads()
    expect(ctx.sourcesOf('loop')[0].loopEnd).toBe(loopEnd)
    sound.spinEnd()
    sound.landed(0)
    expect(ctx.sourcesOf('christmas-stinger')).toHaveLength(1)
    expect(ctx.sourcesOf('christmas-win')).toHaveLength(1)
    sound.spinStart()
    expect(ctx.sourcesOf('christmas-loop')).toHaveLength(1)
    expect(ctx.sourcesOf('christmas-bells')).toHaveLength(1)
  })

  test('with nothing decoded the landing plays the march stinger and the applause alone', async () => {
    const { audio, sound } = withFiles(() => false)
    sound.setSeason('christmas')
    document.dispatchEvent(new Event('pointerup'))
    await audio.finishLoads()
    sound.spinStart()
    sound.landed(0)
    const ctx = audio.ctx
    expect(ctx.sourcesOf('loop')).toHaveLength(1)
    expect(ctx.sourcesOf('stinger')).toHaveLength(1)
    expect(ctx.sourcesOf('applause')).toHaveLength(1)
    for (const name of christmas) expect(ctx.sourcesOf(name)).toHaveLength(0)
  })

  test('with only the stinger decoded the stinger is the season and the loop the march', async () => {
    const { audio, sound } = withFiles((name) => name === 'christmas-stinger')
    sound.setSeason('christmas')
    document.dispatchEvent(new Event('pointerup'))
    await audio.finishLoads()
    sound.spinStart()
    sound.landed(0)
    const ctx = audio.ctx
    expect(ctx.sourcesOf('loop')).toHaveLength(1)
    expect(ctx.sourcesOf('christmas-stinger')).toHaveLength(1)
    expect(ctx.sourcesOf('stinger')).toHaveLength(0)
    expect(ctx.sourcesOf('applause')).toHaveLength(1)
    expect(ctx.sourcesOf('christmas-win')).toHaveLength(0)
    expect(ctx.sourcesOf('christmas-bells')).toHaveLength(0)
  })
})

describe('the win sound', () => {
  test('it rides the crowd gain with the applause, in landed and fanfare and not landedQuiet', async () => {
    const { ctx, sound } = await ready((s) => s.setSeason('christmas'))
    sound.landed(2)
    const [win] = ctx.sourcesOf('christmas-win')
    const [applause] = ctx.sourcesOf('applause')
    expect(win.started?.when).toBe(applause.started?.when)
    expect(win.reaches(ctx.effects)).toBe(true)
    expect(win.reaches(ctx.music)).toBe(false)
    sound.fanfare(1)
    expect(ctx.sourcesOf('christmas-win')).toHaveLength(2)
    sound.landedQuiet()
    sound.landedQuiet(true)
    expect(ctx.sourcesOf('christmas-win')).toHaveLength(2)
  })

  test('on the wildcard wheel it passes through the film-reel chain as the applause does', async () => {
    const { ctx, sound } = await ready((s) => s.setSeason('christmas'))
    sound.reelChange()
    sound.landed(1)
    const [win] = ctx.sourcesOf('christmas-win')
    const [applause] = ctx.sourcesOf('applause')
    // Both gains feed the crowd gain, which the reel chain took in.
    expect(win.out[0].out).toEqual(applause.out[0].out)
    expect(win.out[0].out[0]).not.toBe(ctx.effects)
    expect(win.reaches(ctx.effects)).toBe(true)
  })

  test('with no season there is no win sound', async () => {
    const { ctx, sound } = await ready()
    sound.landed(1)
    expect(ctx.sourcesOf('christmas-win')).toHaveLength(0)
  })
})

describe('the spin bells', () => {
  test('they start with the hum at every spin, on both wheels and with a countdown, on the effects bus', async () => {
    const { ctx, sound } = await ready((s) => s.setSeason('christmas'))
    sound.spinStart()
    sound.spinEnd()
    sound.spinStart(true)
    sound.spinEnd()
    sound.spinStart(false, true)
    const bells = ctx.sourcesOf('christmas-bells')
    expect(bells).toHaveLength(3)
    for (const b of bells) {
      expect(b.loop).toBe(true)
      expect(b.loopStart).toBe(0.2)
      expect(b.loopEnd).toBe(4)
      expect(b.reaches(ctx.effects)).toBe(true)
    }
    expect(ctx.sourcesOf('hum')).toHaveLength(3)
  })

  test('they follow the wheel, fall silent in the last moment and stop at spinEnd', async () => {
    const { ctx, sound } = await ready((s) => s.setSeason('christmas'))
    sound.spinStart()
    const [bells] = ctx.sourcesOf('christmas-bells')
    const gain = bells.out[0] as FakeGain
    sound.spinSpeed(1, 5)
    const peak = gain.gain.value
    const rate = bells.playbackRate.value
    sound.spinSpeed(0.1, 5)
    expect(gain.gain.value).toBeLessThan(peak)
    expect(gain.gain.value).toBeGreaterThan(peak * minBellsGain * 0.9)
    expect(bells.playbackRate.value).toBeLessThan(rate)
    sound.spinSpeed(0.1, 0)
    expect(gain.gain.value).toBe(0)
    sound.spinEnd()
    expect(bells.stoppedAt).not.toBeNull()
  })

  test('on the wildcard wheel they stay on the plain effects bus, outside the reel chain', async () => {
    const { ctx, sound } = await ready((s) => s.setSeason('christmas'))
    sound.reelChange()
    sound.spinStart(false, true)
    const [bells] = ctx.sourcesOf('christmas-bells')
    expect(bells.out[0].out).toEqual([ctx.effects])
  })

  test('with no season no bells source is made', async () => {
    const { ctx, sound } = await ready()
    sound.spinStart()
    expect(ctx.sourcesOf('christmas-bells')).toHaveLength(0)
  })
})
