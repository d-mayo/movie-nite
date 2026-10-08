import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import logoDark from './assets/logo/logo-dark-transparent.svg'
import logoLight from './assets/logo/logo-light-transparent.svg'
import tmdbLogo from './assets/tmdb-logo.svg'
import './App.css'
import { HeldFilmCard, HeldFilmChip, type FocusRequest } from './components/HeldFilm.tsx'
import NightControls from './components/NightControls.tsx'
import NightSetup from './components/NightSetup.tsx'
import WheelPanel from './components/WheelPanel.tsx'
import TokenPrompt from './components/TokenPrompt.tsx'
import { AppStoreContext, useApp, type AppStore } from './state/store.ts'
import { createTmdbClient } from './tmdb/client.ts'

interface Props {
  store: AppStore
  fetchFn?: typeof fetch
  random?: () => number
  spinMs?: number
}

const rejectedMessage = 'TMDB rejected the saved token'

function Attribution() {
  return (
    <footer>
      <img src={tmdbLogo} alt="TMDB" height="12" />
      <p>
        This product uses the TMDB API but is not endorsed or certified by TMDB.
      </p>
    </footer>
  )
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

function Screen({ fetchFn, random, spinMs }: Omit<Props, 'store'>) {
  const { settings, setToken, setViewersHidden } = useApp()
  const [message, setMessage] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)
  const [changingToken, setChangingToken] = useState(false)
  const [focusRequest, setFocusRequest] = useState<FocusRequest>(null)
  // Set by a Hide or Show press and consumed once, so reloading hidden takes no focus.
  const pendingFocus = useRef<'show' | 'hide' | null>(null)
  const showTab = useRef<HTMLButtonElement>(null)
  const [reasonSlot, setReasonSlot] = useState<HTMLElement | null>(null)
  const hideButton = useRef<HTMLButtonElement>(null)
  const token = settings.tmdbToken
  const hidden = settings.viewersHidden
  useEffect(() => {
    const target = pendingFocus.current === 'show' ? showTab : hideButton
    if (pendingFocus.current) target.current?.focus()
    pendingFocus.current = null
  }, [hidden])
  // Bumped by Cancel, so a check that settles afterwards is discarded.
  const tokenChecks = useRef(0)

  async function saveToken(candidate: string) {
    const check = tokenChecks.current
    await createTmdbClient(candidate, fetchFn).checkToken()
    if (check !== tokenChecks.current) return
    setMessage(null)
    setToken(candidate)
    setChangingToken(false)
  }

  // The one place a TmdbAuthError from any TMDB call ends up.
  const handleAuthError = useCallback(() => {
    setMessage(rejectedMessage)
    // The wheel unmounts with the token, possibly mid-spin, so unlock setup here.
    setLocked(false)
    setChangingToken(false)
    setToken(null)
  }, [setToken])
  const client = useMemo(
    () => (token ? createTmdbClient(token, fetchFn) : null),
    [token, fetchFn],
  )

  if (!token || !client || changingToken) {
    return (
      <>
        <Banner />
        <main>
          <TokenPrompt
            message={message}
            onSubmit={saveToken}
            onCancel={
              token && client
                ? () => {
                    tokenChecks.current += 1
                    setMessage(null)
                    setChangingToken(false)
                  }
                : undefined
            }
          />
        </main>
        <Attribution />
      </>
    )
  }
  return (
    <>
      <Banner>
        <NightControls
          locked={locked}
          heldFilmChip={<HeldFilmChip focusRequest={focusRequest} onRequestFocus={setFocusRequest} />}
          onChangeToken={() => {
            setMessage(null)
            setChangingToken(true)
          }}
        />
      </Banner>
      <main>
        <div className={hidden ? 'night viewers-hidden' : 'night'}>
          <WheelPanel
            random={random}
            spinMs={spinMs}
            client={client}
            onAuthError={handleAuthError}
            onBusyChange={setLocked}
            reasonSlot={reasonSlot}
          />
          <div className="wheel-reason-slot" ref={setReasonSlot} />
          <div className="setup-column">
            <NightSetup
              client={client}
              onAuthError={handleAuthError}
              locked={locked}
              onHide={() => {
                pendingFocus.current = 'show'
                setViewersHidden(true)
              }}
              hideRef={hideButton}
            />
          </div>
        </div>
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
            <span aria-hidden="true">‹</span>
          </button>
        )}
      </main>
      <HeldFilmCard focusRequest={focusRequest} onRequestFocus={setFocusRequest} />
    </>
  )
}

function App({ store, fetchFn, random, spinMs }: Props) {
  return (
    <AppStoreContext.Provider value={store}>
      <Screen fetchFn={fetchFn} random={random} spinMs={spinMs} />
    </AppStoreContext.Provider>
  )
}

export default App
