import { useCallback, useMemo, useState } from 'react'
import tmdbLogo from './assets/tmdb-logo.svg'
import './App.css'
import NightSetup from './components/NightSetup.tsx'
import TokenPrompt from './components/TokenPrompt.tsx'
import { AppStoreContext, useApp, type AppStore } from './state/store.ts'
import { createTmdbClient } from './tmdb/client.ts'

interface Props {
  store: AppStore
  fetchFn?: typeof fetch
}

const rejectedMessage = 'TMDB rejected the saved token'

function Screen({ fetchFn }: { fetchFn?: typeof fetch }) {
  const { settings, setToken } = useApp()
  const [message, setMessage] = useState<string | null>(null)
  const token = settings.tmdbToken

  async function saveToken(candidate: string) {
    await createTmdbClient(candidate, fetchFn).checkToken()
    setMessage(null)
    setToken(candidate)
  }

  // The one place a TmdbAuthError from any TMDB call ends up.
  const handleAuthError = useCallback(() => {
    setMessage(rejectedMessage)
    setToken(null)
  }, [setToken])
  const client = useMemo(
    () => (token ? createTmdbClient(token, fetchFn) : null),
    [token, fetchFn],
  )

  if (!token || !client) return <TokenPrompt message={message} onSubmit={saveToken} />
  return (
    <NightSetup
      client={client}
      onAuthError={handleAuthError}
      onChangeToken={() => {
        setMessage(null)
        setToken(null)
      }}
    />
  )
}

function App({ store, fetchFn }: Props) {
  return (
    <AppStoreContext.Provider value={store}>
      <main>
        <h1>Movie Nite</h1>
        <Screen fetchFn={fetchFn} />
      </main>
      <footer>
        <img src={tmdbLogo} alt="TMDB" height="20" />
        <p>
          This product uses the TMDB API but is not endorsed or certified by
          TMDB.
        </p>
      </footer>
    </AppStoreContext.Provider>
  )
}

export default App
