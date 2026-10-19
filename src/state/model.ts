import {
  defaultWheelSettings,
  effectiveSetting,
  isValidSliceCount,
  isValidSpinSeconds,
  isValidSoundVolume,
  isValidSpinTurnsPerSecond,
  isValidWeight,
  isValidWildcardCount,
  type Adjustment,
  type WheelSettings,
} from '../wheel/edit.ts'
import type { CardEffect } from '../wildcards/cards.ts'
import { firstFreePreset, isPreset, maxViewers } from '../wheel/colors.ts'
import { isLinkableUsername } from '../letterboxd/links.ts'

export interface Nomination {
  tmdbId: number
  title: string
  year: number | null
  posterPath: string | null
  overview: string
  runtime: number | null
  genres: string[]
  // Set when the film was drawn from the viewer's Letterboxd watchlist, which is what lets them re-roll it.
  fromWatchlist?: boolean
}

export type LetterboxdStatus = 'pending' | 'found' | 'missing'

export interface LetterboxdLink {
  username: string
  status: LetterboxdStatus
}

export interface Viewer {
  id: string
  name: string
  color: string
  // Their Letterboxd profile, kept across nights; pending until the background check resolves.
  letterboxd?: LetterboxdLink
}

export interface AppState {
  version: 1
  settings: { viewersHidden: boolean; wheel: WheelSettings }
  roster: Viewer[]
  night: {
    presentIds: string[]
    nominations: Record<string, Nomination>
    wonFilms: number[]
    watched: Nomination[]
    ended: boolean
    // What the host changed for a viewer tonight; the wheel is derived from these.
    adjustments: Record<string, Adjustment>
    // True once a spin has started this night; the first one clears the held film.
    spun: boolean
    // True while the held film's corner card is shrunk to the banner chip.
    holdoverDismissed: boolean
    // The landed wildcard cards; the wheel is derived with them for the rest of the night.
    cardEffects: CardEffect[]
  }
  holdover: Nomination | null
}

export const defaultState: AppState = {
  version: 1,
  settings: { viewersHidden: false, wheel: defaultWheelSettings },
  roster: [],
  night: {
    presentIds: [],
    nominations: {},
    wonFilms: [],
    watched: [],
    ended: false,
    adjustments: {},
    spun: false,
    holdoverDismissed: false,
    cardEffects: [],
  },
  holdover: null,
}

export function setViewersHidden(state: AppState, hidden: boolean): AppState {
  return { ...state, settings: { ...state.settings, viewersHidden: hidden } }
}

export const maxNameLength = 20
export { maxViewers }

export function addViewer(state: AppState, name: string, id: string): AppState {
  const trimmed = name.trim().slice(0, maxNameLength)
  if (!trimmed) return state
  if (state.roster.length >= maxViewers) return state
  const lower = trimmed.toLowerCase()
  if (state.roster.some((v) => v.name.toLowerCase() === lower)) return state
  const color = firstFreePreset(state.roster.map((v) => v.color))
  if (color === null) return state
  return {
    ...state,
    roster: [...state.roster, { id, name: trimmed, color }],
    night: { ...state.night, presentIds: [...state.night.presentIds, id] },
  }
}

export function setViewerColor(state: AppState, id: string, color: string): AppState {
  if (!isPreset(color)) return state
  const viewer = state.roster.find((v) => v.id === id)
  if (!viewer || viewer.color === color) return state
  if (state.roster.some((v) => v.color === color)) return state
  return { ...state, roster: state.roster.map((v) => (v.id === id ? { ...v, color } : v)) }
}

// Links a username (lowercased, pending its check); one the app can't link changes nothing.
export function linkLetterboxd(state: AppState, id: string, username: string): AppState {
  if (!isLinkableUsername(username)) return state
  const letterboxd: LetterboxdLink = { username: username.toLowerCase(), status: 'pending' }
  if (!state.roster.some((v) => v.id === id)) return state
  return { ...state, roster: state.roster.map((v) => (v.id === id ? { ...v, letterboxd } : v)) }
}

// Sets the check's outcome, only while that username is still the one linked.
export function setLetterboxdStatus(
  state: AppState,
  id: string,
  username: string,
  status: LetterboxdStatus,
): AppState {
  const viewer = state.roster.find((v) => v.id === id)
  if (!viewer?.letterboxd || viewer.letterboxd.username !== username) return state
  if (viewer.letterboxd.status === status) return state
  return {
    ...state,
    roster: state.roster.map((v) => (v.id === id ? { ...v, letterboxd: { username, status } } : v)),
  }
}

export function unlinkLetterboxd(state: AppState, id: string): AppState {
  const viewer = state.roster.find((v) => v.id === id)
  if (!viewer?.letterboxd) return state
  return {
    ...state,
    roster: state.roster.map((v) => {
      if (v.id !== id) return v
      const { letterboxd: _dropped, ...rest } = v
      void _dropped
      return rest
    }),
  }
}

const letterboxdStatuses: readonly unknown[] = ['pending', 'found', 'missing']

// A stored Letterboxd link, or undefined when its username or status isn't valid.
export function validLetterboxd(value: unknown): LetterboxdLink | undefined {
  if (!value || typeof value !== 'object') return undefined
  const { username, status } = value as { username?: unknown; status?: unknown }
  if (!isLinkableUsername(username) || !letterboxdStatuses.includes(status)) return undefined
  return { username: username.toLowerCase(), status: status as LetterboxdStatus }
}

function withoutNomination(
  nominations: Record<string, Nomination>,
  viewerId: string,
): Record<string, Nomination> {
  const { [viewerId]: _dropped, ...rest } = nominations
  void _dropped
  return rest
}

export function removeViewer(state: AppState, id: string): AppState {
  const { [id]: _dropped, ...adjustments } = state.night.adjustments
  void _dropped
  return {
    ...state,
    roster: state.roster.filter((v) => v.id !== id),
    night: {
      ...state.night,
      presentIds: state.night.presentIds.filter((p) => p !== id),
      nominations: withoutNomination(state.night.nominations, id),
      adjustments,
    },
  }
}

function hasWon(night: AppState['night'], viewerId: string): boolean {
  const film = night.nominations[viewerId]
  return film !== undefined && night.wonFilms.includes(film.tmdbId)
}

export function setPresent(state: AppState, id: string, present: boolean): AppState {
  if (!state.roster.some((v) => v.id === id)) return state
  const isPresent = state.night.presentIds.includes(id)
  if (present === isPresent) return state
  // An away viewer keeps their film, so hiding someone briefly loses nothing.
  return {
    ...state,
    night: {
      ...state.night,
      presentIds: present
        ? [...state.night.presentIds, id]
        : state.night.presentIds.filter((p) => p !== id),
    },
  }
}

// The films a Picks Again card has refused this viewer tonight.
export function refusedFilms(night: AppState['night'], viewerId: string): number[] {
  const ids: number[] = []
  for (const { change } of night.cardEffects) {
    if (change.kind === 'picksAgain' && change.viewerIds[0] === viewerId) ids.push(change.tmdbId)
  }
  return ids
}

// True while the viewer's film is one a Reshuffle gave them; only a later card replaces it.
export function isReshuffleLocked(night: AppState['night'], viewerId: string): boolean {
  const film = night.nominations[viewerId]
  if (!film) return false
  return night.cardEffects.some(
    ({ change }) =>
      change.kind === 'reshuffle' && change.viewerIds[0] === viewerId && change.tmdbId === film.tmdbId,
  )
}

// True while a Blind Spin is waiting for the next main spin to land.
export function isBlind(night: AppState['night']): boolean {
  return night.cardEffects.some(({ change }) => change.kind === 'blindSpin' && !change.used)
}

// Takes a viewer's film back off the wheel. A film that has won, or that a Reshuffle gave them, is not taken back.
export function removeNomination(state: AppState, viewerId: string): AppState {
  if (!state.night.nominations[viewerId] || hasWon(state.night, viewerId)) return state
  if (isReshuffleLocked(state.night, viewerId)) return state
  return {
    ...state,
    night: { ...state.night, nominations: withoutNomination(state.night.nominations, viewerId) },
  }
}

export function nominate(state: AppState, viewerId: string, nomination: Nomination): AppState {
  if (!state.night.presentIds.includes(viewerId)) return state
  if (hasWon(state.night, viewerId)) return state
  if (state.night.wonFilms.includes(nomination.tmdbId)) return state
  if (refusedFilms(state.night, viewerId).includes(nomination.tmdbId)) return state
  if (isReshuffleLocked(state.night, viewerId)) return state
  return {
    ...state,
    night: {
      ...state.night,
      nominations: { ...state.night.nominations, [viewerId]: nomination },
    },
  }
}

// Leftover nominations (films that never won) carry over until their viewer changes them.
export function newNight(state: AppState): AppState {
  const nominations = Object.fromEntries(
    Object.entries(state.night.nominations).filter(
      ([, film]) => !state.night.wonFilms.includes(film.tmdbId),
    ),
  )
  return {
    ...state,
    night: {
      ...state.night,
      nominations,
      wonFilms: [],
      watched: [],
      ended: false,
      adjustments: {},
      spun: false,
      holdoverDismissed: false,
      cardEffects: [],
    },
  }
}

export function viewersOnWheel(night: AppState['night']): string[] {
  return night.presentIds.filter((id) => !hasWon(night, id))
}

function withWheel(state: AppState, change: Partial<WheelSettings>): AppState {
  return { ...state, settings: { ...state.settings, wheel: { ...state.settings.wheel, ...change } } }
}

// Turning One per viewer off keeps the wildcards the wheel had: the count
// becomes tonight's number of viewers on the wheel.
export function setWildcardsPerViewer(state: AppState, on: boolean): AppState {
  if (state.settings.wheel.wildcardsPerViewer === on) return state
  return withWheel(state, {
    wildcardsPerViewer: on,
    ...(on ? {} : { wildcardCount: viewersOnWheel(state.night).length }),
  })
}

export function setWildcardCount(state: AppState, count: number): AppState {
  if (!isValidWildcardCount(count) || count === state.settings.wheel.wildcardCount) return state
  return withWheel(state, { wildcardCount: count })
}

export function setWildcardWeight(state: AppState, weight: number): AppState {
  if (!isValidWeight(weight) || weight === state.settings.wheel.wildcardWeight) return state
  return withWheel(state, { wildcardWeight: weight })
}

export function setDefaultSlices(state: AppState, count: number): AppState {
  if (!isValidSliceCount(count) || count === state.settings.wheel.defaultSlices) return state
  return withWheel(state, { defaultSlices: count })
}

export function setDefaultWeight(state: AppState, weight: number): AppState {
  if (!isValidWeight(weight) || weight === state.settings.wheel.defaultWeight) return state
  return withWheel(state, { defaultWeight: weight })
}

export function setSpinSeconds(state: AppState, seconds: number): AppState {
  if (!isValidSpinSeconds(seconds) || seconds === state.settings.wheel.spinSeconds) return state
  return withWheel(state, { spinSeconds: seconds })
}

export function setSpinTurnsPerSecond(state: AppState, turns: number): AppState {
  if (!isValidSpinTurnsPerSecond(turns) || turns === state.settings.wheel.spinTurnsPerSecond) {
    return state
  }
  return withWheel(state, { spinTurnsPerSecond: turns })
}

export function setSoundMusic(state: AppState, level: number): AppState {
  if (!isValidSoundVolume(level) || level === state.settings.wheel.soundMusic) return state
  return withWheel(state, { soundMusic: level })
}

export function setSoundEffects(state: AppState, level: number): AppState {
  if (!isValidSoundVolume(level) || level === state.settings.wheel.soundEffects) return state
  return withWheel(state, { soundEffects: level })
}

export function setSoundMuted(state: AppState, muted: boolean): AppState {
  if (state.settings.wheel.soundMuted === muted) return state
  return withWheel(state, { soundMuted: muted })
}

export function setWildcardWheel(state: AppState, on: boolean): AppState {
  if (state.settings.wheel.wildcardWheel === on) return state
  return withWheel(state, { wildcardWheel: on })
}

// Switches one wildcard card on or off by its id.
export function setCardEnabled(state: AppState, cardId: string, enabled: boolean): AppState {
  const disabled = state.settings.wheel.disabledCards
  if (disabled.includes(cardId) === !enabled) return state
  return withWheel(state, {
    disabledCards: enabled ? disabled.filter((id) => id !== cardId) : [...disabled, cardId],
  })
}

export function setShowLabels(state: AppState, show: boolean): AppState {
  if (state.settings.wheel.showLabels === show) return state
  return withWheel(state, { showLabels: show })
}

export function setSoundVolume(state: AppState, volume: number): AppState {
  if (!isValidSoundVolume(volume) || volume === state.settings.wheel.soundVolume) return state
  return withWheel(state, { soundVolume: volume })
}

// Every global wheel setting back to its factory value; viewers' adjustments stay.
export function restoreWheelSettings(state: AppState): AppState {
  return withWheel(state, defaultWheelSettings)
}

function adjust(state: AppState, viewerId: string, change: Adjustment): AppState {
  if (!state.roster.some((v) => v.id === viewerId)) return state
  return {
    ...state,
    night: {
      ...state.night,
      adjustments: {
        ...state.night.adjustments,
        [viewerId]: { ...state.night.adjustments[viewerId], ...change },
      },
    },
  }
}

// A set that matches the current effective value records nothing; any other
// valid set is kept as an adjustment, even one that equals the default.
export function setViewerWeightOnWheel(state: AppState, viewerId: string, weight: number): AppState {
  const now = effectiveSetting(state.settings.wheel, state.night.adjustments, viewerId)
  if (!isValidWeight(weight) || weight === now.weight) return state
  return adjust(state, viewerId, { weight })
}

export function setViewerSliceCount(state: AppState, viewerId: string, count: number): AppState {
  const now = effectiveSetting(state.settings.wheel, state.night.adjustments, viewerId)
  if (!isValidSliceCount(count) || count === now.slices) return state
  return adjust(state, viewerId, { slices: count })
}

export function resetViewerSetting(state: AppState, viewerId: string): AppState {
  if (!state.night.adjustments[viewerId]) return state
  const { [viewerId]: _dropped, ...adjustments } = state.night.adjustments
  void _dropped
  return { ...state, night: { ...state.night, adjustments } }
}

// Deletes every adjustment, away viewers' included.
export function resetViewerSettings(state: AppState): AppState {
  if (Object.keys(state.night.adjustments).length === 0) return state
  return { ...state, night: { ...state.night, adjustments: {} } }
}

export type Outcome = 'watch' | 'tooLong'

export function recordOutcome(
  state: AppState,
  nomination: Nomination,
  outcome: Outcome,
  fromWheel: boolean,
): AppState {
  const night = {
    ...state.night,
    wonFilms: fromWheel ? [...state.night.wonFilms, nomination.tmdbId] : state.night.wonFilms,
    watched: outcome === 'watch' ? [...state.night.watched, nomination] : state.night.watched,
  }
  if (fromWheel && viewersOnWheel(night).length === 0) night.ended = true
  if (outcome === 'tooLong') night.holdoverDismissed = false
  return {
    ...state,
    night,
    holdover: outcome === 'tooLong' ? nomination : state.holdover,
  }
}

// Lands a card. A Picks Again takes the viewer's film off the wheel and a
// Reshuffle puts `nomination` in its place, in the same update as the effect.
export function addCardEffect(
  state: AppState,
  effect: CardEffect,
  nomination?: Nomination,
): AppState {
  const { change } = effect
  let nominations = state.night.nominations
  if (change.kind === 'picksAgain') {
    nominations = withoutNomination(nominations, change.viewerIds[0])
  } else if (change.kind === 'reshuffle') {
    if (!nomination || nomination.tmdbId !== change.tmdbId) return state
    nominations = { ...nominations, [change.viewerIds[0]]: nomination }
  }
  return {
    ...state,
    night: { ...state.night, nominations, cardEffects: [...state.night.cardEffects, effect] },
  }
}

export function endNight(state: AppState): AppState {
  return { ...state, night: { ...state.night, ended: true } }
}

export function clearHoldover(state: AppState): AppState {
  return { ...state, holdover: null }
}

// The first spin of a night uses up the film held from an earlier one, and any
// spin uses up a pending Blind Spin.
export function startSpin(state: AppState): AppState {
  const blind = isBlind(state.night)
  if (state.night.spun && !blind) return state
  const cardEffects = blind
    ? state.night.cardEffects.map((e) =>
        e.change.kind === 'blindSpin' ? { ...e, change: { ...e.change, used: true } } : e,
      )
    : state.night.cardEffects
  return {
    ...state,
    night: { ...state.night, spun: true, cardEffects },
    holdover: state.night.spun ? state.holdover : null,
  }
}

export function setHoldoverDismissed(state: AppState, dismissed: boolean): AppState {
  return { ...state, night: { ...state.night, holdoverDismissed: dismissed } }
}
