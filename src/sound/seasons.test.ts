import { describe, expect, test } from 'vitest'
import { marchSet, setFiles, soundSets, type SoundSet } from './seasons.ts'

describe('the sound sets', () => {
  test('the march names its loop and stinger', () => {
    expect(setFiles(marchSet)).toEqual(['loop', 'stinger'])
  })

  test.each<[string, SoundSet]>([
    ['the march', marchSet],
    ['Christmas', soundSets.christmas!],
  ])('%s: every figure falls inside the length its file records', (_name, set) => {
    if (set.loop) {
      expect(set.loop.loopStart).toBeGreaterThan(0)
      expect(set.loop.loopEnd).toBeGreaterThan(set.loop.loopStart)
      expect(set.loop.loopEnd).toBeLessThanOrEqual(set.loop.length)
    }
    if (set.stinger) {
      expect(set.stinger.hit).toBeGreaterThan(0)
      expect(set.stinger.hit).toBeLessThan(set.stinger.seconds)
    }
    if (set.bells) {
      expect(set.bells.loopStart).toBeGreaterThanOrEqual(0)
      expect(set.bells.loopEnd).toBeGreaterThan(set.bells.loopStart)
      expect(set.bells.loopEnd).toBeLessThanOrEqual(set.bells.length)
    }
    if (set.win) expect(set.win.length).toBeGreaterThan(0)
  })

  test('only Christmas has a set so far', () => {
    expect(Object.keys(soundSets)).toEqual(['christmas'])
    expect(setFiles(soundSets.christmas!)).toEqual(['christmas-loop', 'christmas-stinger', 'christmas-win', 'christmas-bells'])
  })
})
