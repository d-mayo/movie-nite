import tmdbLogo from './assets/tmdb-logo.svg'
import './App.css'

function App() {
  return (
    <>
      <main>
        <h1>Movie Nite</h1>
        <p>Pick tonight's film together.</p>
      </main>
      <footer>
        <img src={tmdbLogo} alt="TMDB" height="20" />
        <p>
          This product uses the TMDB API but is not endorsed or certified by
          TMDB.
        </p>
      </footer>
    </>
  )
}

export default App
