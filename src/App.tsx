import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import logoDark from './assets/logo/logo-dark-transparent.svg'
import logoLight from './assets/logo/logo-light-transparent.svg'
import './App.css'
import { HeldFilmCard, HeldFilmChip, type FocusRequest } from './components/HeldFilm.tsx'
import NightControls from './components/NightControls.tsx'
import NightSetup from './components/NightSetup.tsx'
import ViewerKey from './components/ViewerKey.tsx'
import WheelPanel from './components/WheelPanel.tsx'
import type { SoundEngine } from './sound/engine.ts'
import { AppStoreContext, useApp, type AppStore } from './state/store.ts'
import { createTmdbClient, defaultApiBase } from './tmdb/client.ts'
import { createLetterboxdClient } from './letterboxd/client.ts'
import { useProfileChecks } from './letterboxd/useProfileChecks.ts'

interface Props {
  store: AppStore
  fetchFn?: typeof fetch
  random?: () => number
  spinMs?: number
  // The sound engine; silent when left out.
  sound?: SoundEngine
}

function Banner({ children }: { children?: ReactNode }) {
  return (
    <header className="banner">
      <h1>
        <picture>
          <source media="(prefers-color-scheme: dark)" srcSet={logoDark} />
          <img src={logoLight} alt="Movie Nite" />
        </picture>
      </h1>
      {children}
    </header>
  )
}

function Screen({ fetchFn, random, spinMs, sound }: Omit<Props, 'store'>) {
  const { settings, setViewersHidden } = useApp()
  const [locked, setLocked] = useState(false)
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

  return (
    <>
      <Banner>
        <NightControls
          locked={locked}
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
            onBusyChange={setLocked}
            reasonSlot={reasonSlot}
          />
          <div className="wheel-reason-slot" ref={setReasonSlot} />
          <div className="setup-column">
            <NightSetup
              client={client}
              locked={locked}
              letterboxdWaiting={letterboxdWaiting}
              onHide={() => {
                pendingFocus.current = 'show'
                setViewersHidden(true)
              }}
              hideRef={hideButton}
            />
          </div>
        </div>
        <ViewerKey />
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

function App({ store, fetchFn, random, spinMs, sound }: Props) {
  return (
    <AppStoreContext.Provider value={store}>
      <Screen fetchFn={fetchFn} random={random} spinMs={spinMs} sound={sound} />
    </AppStoreContext.Provider>
  )
}

export default App
