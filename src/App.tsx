import tmdbLogo from './assets/tmdb-logo.svg'
import './App.css'
import TokenPrompt from './components/TokenPrompt.tsx'
import { AppStoreContext, useApp, type AppStore } from './state/store.ts'
import { createTmdbClient } from './tmdb/client.ts'

interface Props {
  store: AppStore
  fetchFn?: typeof fetch
}

function Screen({ fetchFn }: { fetchFn?: typeof fetch }) {
  const { settings, setToken } = useApp()
  const token = settings.tmdbToken

  async function saveToken(candidate: string) {
    await createTmdbClient(candidate, fetchFn).checkToken()
    setToken(candidate)
  }

  if (!token) return <TokenPrompt onSubmit={saveToken} />
  return <p>Setup</p>
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
