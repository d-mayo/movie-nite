import type { SeasonId } from '../seasons/seasons.ts'
import type { SoundName } from './engine.ts'

// A sound set: the files of a soundtrack's parts and the figures the engine needs to play each. Every
// part is optional in a season's set; one missing, or not decoded by its cue, falls back to the march's.
// `length` is the file's length in seconds (measured with ffprobe when cut), so the figures can be checked
// without decoding.
export interface LoopPart {
  name: SoundName
  // The lead-in's end, and the loop's end (with the encoder's margin after it).
  loopStart: number
  loopEnd: number
  length: number
}

export interface StingerPart {
  name: SoundName
  // Where the main hit falls in the file, and the file's length.
  hit: number
  seconds: number
}

export interface WinPart {
  name: SoundName
  length: number
}

export interface BellsPart {
  name: SoundName
  loopStart: number
  loopEnd: number
  length: number
}

export interface SoundSet {
  loop?: LoopPart
  stinger?: StingerPart
  // Variants of the win sound; one of the decoded ones plays, at random.
  win?: WinPart[]
  bells?: BellsPart
}

// The march: the base soundtrack, decoded at the first gesture.
export const marchSet: Required<Pick<SoundSet, 'loop' | 'stinger'>> = {
  loop: { name: 'loop', loopStart: 2.0, loopEnd: 32.12, length: 32.22 },
  stinger: { name: 'stinger', hit: 1.65, seconds: 3.03 },
}

// The seasons that have a sound set. Halloween and Valentine's Day have none yet.
export type SoundSets = Partial<Record<SeasonId, SoundSet>>

// Christmas's files come in with their cut; until then no URL is mapped for them and the march plays.
export const soundSets: SoundSets = {
  christmas: {
    loop: { name: 'christmas-loop', loopStart: 2.0, loopEnd: 30, length: 30.1 },
    stinger: { name: 'christmas-stinger', hit: 1.5, seconds: 3 },
    win: [
      { name: 'christmas-win-1', length: 2.2 },
      { name: 'christmas-win-2', length: 3.2 },
      { name: 'christmas-win-3', length: 4 },
      { name: 'christmas-win-4', length: 3.7 },
    ],
    bells: { name: 'christmas-bells', loopStart: 0.1, loopEnd: 4, length: 4.1 },
  },
}

// The file names a set asks for.
export function setFiles(set: SoundSet): SoundName[] {
  return [set.loop?.name, set.stinger?.name, ...(set.win ?? []).map((v) => v.name), set.bells?.name].filter((n): n is SoundName => n !== undefined)
}
