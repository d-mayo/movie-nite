import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import logoDark from './assets/logo/logo-dark-transparent.svg'
import logoLight from './assets/logo/logo-light-transparent.svg'
import christmasDark from './assets/logo/seasons/logo-christmas-dark-transparent.svg'
import christmasLight from './assets/logo/seasons/logo-christmas-light-transparent.svg'
import './App.css'
import { HeldFilmCard, HeldFilmChip, type FocusRequest } from './components/HeldFilm.tsx'
import { forcedSeason, useDebugOptions } from './components/debugOptions.ts'
import NightControls from './components/NightControls.tsx'
import NightSetup from './components/NightSetup.tsx'
import ViewerKey from './components/ViewerKey.tsx'
import WheelPanel from './components/WheelPanel.tsx'
import { activeSeason, seasonOf, type SeasonId } from './seasons/seasons.ts'
import type { SoundEngine } from './sound/engine.ts'
import { applyDebugLink } from './state/debugLink.ts'
import { AppStoreContext, useApp, type AppStore } from './state/store.ts'
import { createTmdbClient, defaultApiBase } from './tmdb/client.ts'
import { createLetterboxdClient } from './letterboxd/client.ts'
import { useProfileChecks } from './letterboxd/useProfileChecks.ts'
import { useWatchlistWalks } from './letterboxd/useWatchlistWalks.ts'
import { createWatchlistMemory } from './letterboxd/watchlist.ts'

interface Props {
  store: AppStore
  fetchFn?: typeof fetch
  random?: () => number
  spinMs?: number
  // The sound engine; silent when left out.
  sound?: SoundEngine
  // The date the season is worked out from, read once; the current date when left out.
  today?: Date
}

// The banner's logo pair for a theme; the seasons without their own look show the plain logo.
const logos: Partial<Record<SeasonId, { light: string; dark: string }>> = {
  christmas: { light: christmasLight, dark: christmasDark },
}

function Banner({ season, children }: { season: SeasonId | null; children?: ReactNode }) {
  const logo = (season && logos[season]) || { light: logoLight, dark: logoDark }
  return (
    <header className="banner">
      <h1>
        <picture>
          <source media="(prefers-color-scheme: dark)" srcSet={logo.dark} />
          <img src={logo.light} alt="Movie Nite" />
        </picture>
      </h1>
      {children}
    </header>
  )
}

function Screen({ fetchFn, random, spinMs, sound, today }: Omit<Props, 'store'>) {
  const { settings, setViewersHidden } = useApp()
  const debugFlag = !!settings.debugEnabled
  const [debugOptions, setDebugOptions] = useDebugOptions()
  // The date is read once, when the app mounts.
  const [loadDate] = useState(() => today ?? new Date())
  const forced = debugFlag ? forcedSeason(debugOptions.season) : undefined
  // What the Seasons line names: the forced season, else the date's.
  const seasonNow = forced !== undefined ? forced : seasonOf(loadDate)
  // The theme in force: the forced season, else none while the switch is off, else the date's.
  const theme = activeSeason({ forced, enabled: settings.wheel.seasonalThemes, date: loadDate })
  const [locked, setLocked] = useState(false)
  const [blind, setBlind] = useState(false)
  const [focusRequest, setFocusRequest] = useState<FocusRequest>(null)
  // Set by a Hide or Show press and consumed once, so reloading hidden takes no focus.
  const pendingFocus = useRef<'show' | 'hide' | null>(null)
  const showTab = useRef<HTMLButtonElement>(null)
  const [reasonSlot, setReasonSlot] = useState<HTMLElement | null>(null)
  const hideButton = useRef<HTMLButtonElement>(null)
  const hidden = settings.viewersHidden
  useEffect(() => {
    const target = pendingFocus.current === 'show' ? showTab : hideButton
    if (pendingFocus.current) target.current?.focus()
    pendingFocus.current = null
  }, [hidden])
  const client = useMemo(() => createTmdbClient(defaultApiBase(), fetchFn), [fetchFn])
  const letterboxd = useMemo(() => createLetterboxdClient(defaultApiBase(), fetchFn), [fetchFn])
  const letterboxdWaiting = useProfileChecks(letterboxd)
  // The session's watchlist walks and film ids, kept while the app is open.
  const watchlist = useMemo(
    () => ({ client: letterboxd, memory: createWatchlistMemory(), random: random ?? Math.random }),
    [letterboxd, random],
  )
  const settledWalks = useWatchlistWalks(watchlist)

  return (
    <>
      <Banner season={theme}>
        <NightControls
          locked={locked}
          seasonNow={seasonNow}
          debug={debugFlag ? { options: debugOptions, onChange: setDebugOptions } : undefined}
          heldFilmChip={<HeldFilmChip focusRequest={focusRequest} onRequestFocus={setFocusRequest} />}
        />
      </Banner>
      <main>
        <div className={hidden ? 'night viewers-hidden' : 'night'}>
          <WheelPanel
            random={random}
            spinMs={spinMs}
            sound={sound}
            client={client}
            watchlist={watchlist}
            onBlindChange={setBlind}
            onBusyChange={setLocked}
            reasonSlot={reasonSlot}
            debug={debugFlag ? debugOptions : undefined}
          />
          <div className="wheel-reason-slot" ref={setReasonSlot} />
          <div className="setup-column">
            <NightSetup
              client={client}
              locked={locked}
              letterboxdWaiting={letterboxdWaiting}
              watchlist={watchlist}
              settledWalks={settledWalks}
              onHide={() => {
                pendingFocus.current = 'show'
                setViewersHidden(true)
              }}
              hideRef={hideButton}
            />
          </div>
        </div>
        <ViewerKey blind={blind} />
        {hidden && (
          <button
            type="button"
            ref={showTab}
            className="quiet show-viewers"
            aria-label="Show viewers"
            onClick={() => {
              pendingFocus.current = 'hide'
              setViewersHidden(false)
            }}
          >
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 3L5 8l5 5" />
            </svg>
          </button>
        )}
      </main>
      <HeldFilmCard focusRequest={focusRequest} onRequestFocus={setFocusRequest} />
    </>
  )
}

function App({ store, fetchFn, random, spinMs, sound, today }: Props) {
  // ?debug turns the debug options on for this browser; ?debug=off turns them off.
  useEffect(() => applyDebugLink(store, window.location, window.history), [store])
  return (
    <AppStoreContext.Provider value={store}>
      <Screen fetchFn={fetchFn} random={random} spinMs={spinMs} sound={sound} today={today} />
    </AppStoreContext.Provider>
  )
}

export default App
