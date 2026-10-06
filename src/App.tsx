import { useCallback, useMemo, useState } from 'react'
import logoDark from './assets/logo/logo-dark-transparent.svg'
import logoLight from './assets/logo/logo-light-transparent.svg'
import tmdbLogo from './assets/tmdb-logo.svg'
import './App.css'
import NightSetup from './components/NightSetup.tsx'
import WheelEditor from './components/WheelEditor.tsx'
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

function Screen({ fetchFn, random, spinMs }: Omit<Props, 'store'>) {
  const { settings, night, setToken } = useApp()
  const [message, setMessage] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)
  const [editing, setEditing] = useState(false)
  const token = settings.tmdbToken

  async function saveToken(candidate: string) {
    await createTmdbClient(candidate, fetchFn).checkToken()
    setMessage(null)
    setToken(candidate)
  }

  // The one place a TmdbAuthError from any TMDB call ends up.
  const handleAuthError = useCallback(() => {
    setMessage(rejectedMessage)
    // The wheel unmounts with the token, possibly mid-spin, so unlock setup here.
    setLocked(false)
    setToken(null)
  }, [setToken])
  const client = useMemo(
    () => (token ? createTmdbClient(token, fetchFn) : null),
    [token, fetchFn],
  )

  // The editor gives way to setup when the night ends.
  if (editing && night.ended) setEditing(false)

  if (!token || !client) return <TokenPrompt message={message} onSubmit={saveToken} />
  return (
    <div className="night">
      <WheelPanel
        random={random}
        spinMs={spinMs}
        client={client}
        onAuthError={handleAuthError}
        onBusyChange={setLocked}
      />
      {editing ? (
        <WheelEditor locked={locked} onDone={() => setEditing(false)} />
      ) : (
        <div>
          {!locked && !night.ended && (
            <button type="button" onClick={() => setEditing(true)}>
              Edit wheel
            </button>
          )}
          <NightSetup
            client={client}
            onAuthError={handleAuthError}
            locked={locked}
            onChangeToken={() => {
              setMessage(null)
              setToken(null)
            }}
          />
        </div>
      )}
    </div>
  )
}

function App({ store, fetchFn, random, spinMs }: Props) {
  return (
    <AppStoreContext.Provider value={store}>
      <header className="banner">
        <h1>
          <picture>
            <source media="(prefers-color-scheme: dark)" srcSet={logoDark} />
            <img src={logoLight} alt="Movie Nite" />
          </picture>
        </h1>
      </header>
      <main>
        <Screen fetchFn={fetchFn} random={random} spinMs={spinMs} />
      </main>
      <footer>
        <img src={tmdbLogo} alt="TMDB" height="12" />
        <p>
          This product uses the TMDB API but is not endorsed or certified by
          TMDB.
        </p>
      </footer>
    </AppStoreContext.Provider>
  )
}

export default App
