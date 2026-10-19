import { createContext, useContext } from 'react'
import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'
import {
  addCardEffect,
  addViewer,
  clearHoldover,
  defaultState,
  endNight,
  newNight,
  nominate,
  removeNomination,
  resetViewerSettings,
  recordOutcome,
  removeViewer,
  resetViewerSetting,
  setDefaultSlices,
  setDefaultWeight,
  setWildcardCount,
  setWildcardsPerViewer,
  setWildcardWeight,
  setHoldoverDismissed,
  setPresent,
  setSpinSeconds,
  setSpinTurnsPerSecond,
  setSoundMusic,
  setSoundEffects,
  setSoundVolume,
  setSoundMuted,
  setShowLabels,
  setWildcardWheel,
  restoreWheelSettings,
  setViewersHidden,
  setViewerColor,
  setViewerSliceCount,
  linkLetterboxd,
  setLetterboxdStatus,
  unlinkLetterboxd,
  validLetterboxd,
  setViewerWeightOnWheel,
  startSpin,
  type AppState,
  type LetterboxdStatus,
  type Nomination,
  type Viewer,
  type Outcome,
} from './model.ts'
import { newId } from './id.ts'
import type { Persistence } from './persistence.ts'
import {
  defaultWheelSettings,
  isValidSliceCount,
  isValidSpinSeconds,
  isValidSoundVolume,
  isValidSpinTurnsPerSecond,
  isValidWeight,
  isValidWildcardCount,
  maxWeight,
  type Adjustment,
  type WheelSettings,
} from '../wheel/edit.ts'
import { validCardEffects, type CardEffect } from '../wildcards/cards.ts'
import { assignColors } from '../wheel/colors.ts'

export interface AppActions {
  setViewersHidden(hidden: boolean): void
  addViewer(name: string): void
  removeViewer(id: string): void
  setViewerColor(id: string, color: string): void
  linkLetterboxd(id: string, username: string): void
  setLetterboxdStatus(id: string, username: string, status: LetterboxdStatus): void
  unlinkLetterboxd(id: string): void
  setPresent(id: string, present: boolean): void
  nominate(viewerId: string, nomination: Nomination): void
  removeNomination(viewerId: string): void
  resetAllViewerSettings(): void
  newNight(): void
  recordOutcome(nomination: Nomination, outcome: Outcome, fromWheel: boolean): void
  endNight(): void
  clearHoldover(): void
  startSpin(): void
  setHoldoverDismissed(dismissed: boolean): void
  setViewerWeight(viewerId: string, weight: number): void
  setViewerSlices(viewerId: string, count: number): void
  resetViewerSettings(viewerId: string): void
  setWildcardsPerViewer(on: boolean): void
  setWildcardCount(count: number): void
  setWildcardWeight(weight: number): void
  setDefaultSlices(count: number): void
  setDefaultWeight(weight: number): void
  setSpinSeconds(seconds: number): void
  setSpinTurnsPerSecond(turns: number): void
  setSoundMusic(level: number): void
  setSoundEffects(level: number): void
  setSoundVolume(volume: number): void
  setSoundMuted(muted: boolean): void
  setShowLabels(show: boolean): void
  setWildcardWheel(on: boolean): void
  addCardEffect(effect: CardEffect): void
  restoreWheelSettings(): void
}

export type AppStore = StoreApi<AppState & AppActions>

// Each stored wheel setting that is missing or invalid gets its factory value.
// A stored Music or Effects level; the old on/off switches become 100 and 0.
function soundLevel(stored: unknown, fallback: number): number {
  if (typeof stored === 'boolean') return stored ? 100 : 0
  return typeof stored === 'number' && isValidSoundVolume(stored) ? stored : fallback
}

function mergeWheel(stored: Partial<WheelSettings> | undefined): WheelSettings {
  const d = defaultWheelSettings
  const w = stored ?? {}
  return {
    wildcardsPerViewer:
      typeof w.wildcardsPerViewer === 'boolean' ? w.wildcardsPerViewer : d.wildcardsPerViewer,
    wildcardCount:
      typeof w.wildcardCount === 'number' && isValidWildcardCount(w.wildcardCount)
        ? w.wildcardCount
        : d.wildcardCount,
    wildcardWeight:
      typeof w.wildcardWeight === 'number' && isValidWeight(w.wildcardWeight)
        ? w.wildcardWeight
        : d.wildcardWeight,
    defaultSlices:
      typeof w.defaultSlices === 'number' && isValidSliceCount(w.defaultSlices)
        ? w.defaultSlices
        : d.defaultSlices,
    defaultWeight:
      typeof w.defaultWeight === 'number' && isValidWeight(w.defaultWeight)
        ? w.defaultWeight
        : d.defaultWeight,
    spinSeconds:
      typeof w.spinSeconds === 'number' && isValidSpinSeconds(w.spinSeconds)
        ? w.spinSeconds
        : d.spinSeconds,
    spinTurnsPerSecond:
      typeof w.spinTurnsPerSecond === 'number' && isValidSpinTurnsPerSecond(w.spinTurnsPerSecond)
        ? w.spinTurnsPerSecond
        : d.spinTurnsPerSecond,
    soundMusic: soundLevel(w.soundMusic, d.soundMusic),
    soundEffects: soundLevel(w.soundEffects, d.soundEffects),
    soundVolume:
      typeof w.soundVolume === 'number' && isValidSoundVolume(w.soundVolume)
        ? w.soundVolume
        : d.soundVolume,
    soundMuted: typeof w.soundMuted === 'boolean' ? w.soundMuted : d.soundMuted,
    showLabels: typeof w.showLabels === 'boolean' ? w.showLabels : d.showLabels,
    wildcardWheel: typeof w.wildcardWheel === 'boolean' ? w.wildcardWheel : d.wildcardWheel,
  }
}

// A night saved with an edited layout keeps each viewer's slices and weight that
// differ from the factory ones as adjustments; order, wildcards and the
// wildcard weight are dropped.
function adjustmentsFromLayout(layout: unknown): Record<string, Adjustment> {
  const viewers = (layout as { viewers?: Record<string, { slices?: unknown; weight?: unknown }> })
    ?.viewers
  const adjustments: Record<string, Adjustment> = {}
  if (!viewers || typeof viewers !== 'object') return adjustments
  for (const [id, setting] of Object.entries(viewers)) {
    const adjustment: Adjustment = {}
    if (
      typeof setting?.slices === 'number' &&
      isValidSliceCount(setting.slices) &&
      setting.slices !== defaultWheelSettings.defaultSlices
    ) {
      adjustment.slices = setting.slices
    }
    if (typeof setting?.weight === 'number' && Number.isFinite(setting.weight)) {
      const weight = Math.min(setting.weight, maxWeight)
      if (isValidWeight(weight) && weight !== defaultWheelSettings.defaultWeight) {
        adjustment.weight = weight
      }
    }
    if (Object.keys(adjustment).length > 0) adjustments[id] = adjustment
  }
  return adjustments
}

// A stored Letterboxd link whose username or status isn't valid is dropped; the rest of the viewer is kept.
function withValidLetterboxd(roster: Viewer[]): Viewer[] {
  return roster.map((v) => {
    if (!v || typeof v !== 'object' || !('letterboxd' in v)) return v
    const { letterboxd, ...rest } = v
    const valid = validLetterboxd(letterboxd)
    return valid ? { ...rest, letterboxd: valid } : rest
  })
}

// Merges one level deep so fields added by later versions get their defaults.
function mergeOverDefaults(stored: AppState | null): AppState {
  if (!stored) return defaultState
  const { layout, ...storedNight } = (stored.night ?? {}) as AppState['night'] & {
    layout?: unknown
  }
  const night = { ...defaultState.night, ...storedNight }
  if (!storedNight.adjustments || typeof storedNight.adjustments !== 'object') {
    night.adjustments = layout && typeof layout === 'object' ? adjustmentsFromLayout(layout) : {}
  }
  night.cardEffects = validCardEffects(storedNight.cardEffects)
  // A token stored by an older version is dropped: the Worker holds it now.
  const { tmdbToken: _dropped, ...storedSettings } = (stored.settings ?? {}) as AppState['settings'] & {
    tmdbToken?: unknown
  }
  void _dropped
  return {
    ...defaultState,
    ...stored,
    roster: Array.isArray(stored.roster) ? withValidLetterboxd(assignColors(stored.roster)) : defaultState.roster,
    settings: { ...defaultState.settings, ...storedSettings, wheel: mergeWheel(stored.settings?.wheel) },
    night,
  }
}

function dataOf(full: AppState & AppActions): AppState {
  return {
    version: full.version,
    settings: full.settings,
    roster: full.roster,
    night: full.night,
    holdover: full.holdover,
  }
}

export function createAppStore(persistence: Persistence): AppStore {
  const store = createStore<AppState & AppActions>()((set) => {
    const update = (fn: (s: AppState) => AppState) => set((full) => fn(dataOf(full)))
    return {
      ...mergeOverDefaults(persistence.load()),
      setViewersHidden: (hidden) => update((s) => setViewersHidden(s, hidden)),
      addViewer: (name) => update((s) => addViewer(s, name, newId())),
      removeViewer: (id) => update((s) => removeViewer(s, id)),
      setViewerColor: (id, color) => update((s) => setViewerColor(s, id, color)),
      linkLetterboxd: (id, username) => update((s) => linkLetterboxd(s, id, username)),
      setLetterboxdStatus: (id, username, status) =>
        update((s) => setLetterboxdStatus(s, id, username, status)),
      unlinkLetterboxd: (id) => update((s) => unlinkLetterboxd(s, id)),
      setPresent: (id, present) => update((s) => setPresent(s, id, present)),
      nominate: (viewerId, nomination) => update((s) => nominate(s, viewerId, nomination)),
      resetAllViewerSettings: () => update((s) => resetViewerSettings(s)),
      removeNomination: (viewerId) => update((s) => removeNomination(s, viewerId)),
      newNight: () => update(newNight),
      recordOutcome: (nomination, outcome, fromWheel) =>
        update((s) => recordOutcome(s, nomination, outcome, fromWheel)),
      endNight: () => update(endNight),
      clearHoldover: () => update(clearHoldover),
      startSpin: () => update(startSpin),
      setHoldoverDismissed: (dismissed) => update((s) => setHoldoverDismissed(s, dismissed)),
      setViewerWeight: (id, weight) => update((s) => setViewerWeightOnWheel(s, id, weight)),
      setViewerSlices: (id, count) => update((s) => setViewerSliceCount(s, id, count)),
      resetViewerSettings: (id) => update((s) => resetViewerSetting(s, id)),
      setWildcardsPerViewer: (on) => update((s) => setWildcardsPerViewer(s, on)),
      setWildcardCount: (count) => update((s) => setWildcardCount(s, count)),
      setWildcardWeight: (weight) => update((s) => setWildcardWeight(s, weight)),
      setDefaultSlices: (count) => update((s) => setDefaultSlices(s, count)),
      setDefaultWeight: (weight) => update((s) => setDefaultWeight(s, weight)),
      setSpinSeconds: (seconds) => update((s) => setSpinSeconds(s, seconds)),
      setSpinTurnsPerSecond: (turns) => update((s) => setSpinTurnsPerSecond(s, turns)),
      setSoundMusic: (level) => update((s) => setSoundMusic(s, level)),
      setSoundEffects: (level) => update((s) => setSoundEffects(s, level)),
      setSoundVolume: (volume) => update((s) => setSoundVolume(s, volume)),
      setSoundMuted: (muted) => update((s) => setSoundMuted(s, muted)),
      setShowLabels: (show) => update((s) => setShowLabels(s, show)),
      setWildcardWheel: (on) => update((s) => setWildcardWheel(s, on)),
      addCardEffect: (effect) => update((s) => addCardEffect(s, effect)),
      restoreWheelSettings: () => update(restoreWheelSettings),
    }
  })

  store.subscribe((state, prev) => {
    if (
      state.settings !== prev.settings ||
      state.roster !== prev.roster ||
      state.night !== prev.night ||
      state.holdover !== prev.holdover
    ) {
      persistence.save(dataOf(state))
    }
  })
  persistence.subscribe((remote) => store.setState(mergeOverDefaults(remote)))
  return store
}

export const AppStoreContext = createContext<AppStore | null>(null)

export function useApp(): AppState & AppActions {
  const store = useContext(AppStoreContext)
  if (!store) throw new Error('AppStoreContext is missing')
  return useStore(store)
}
