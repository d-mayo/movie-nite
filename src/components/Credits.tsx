import { useEffect, useRef } from 'react'
import tmdbLogo from '../assets/tmdb-logo.svg'
import { soundCredits } from '../assets/sound/credits.ts'

// Mounted only while shown, like the End night dialog: Close unmounts it directly and
// Escape does so through the native `close` event.
export default function Credits({ onClosed }: { onClosed: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    dialog.addEventListener('close', onClosed)
    return () => dialog.removeEventListener('close', onClosed)
  }, [onClosed])
  function dismiss() {
    ref.current?.close()
    onClosed()
  }
  return (
    <dialog ref={ref} className="card confirm credits" aria-labelledby="credits-heading">
      <h2 id="credits-heading">Credits</h2>
      <section aria-labelledby="credits-film">
        <h3 id="credits-film">Film data</h3>
        <img src={tmdbLogo} alt="TMDB" height="12" />
        <p>
          This product uses the TMDB API but is not endorsed or certified by TMDB. Film data and
          posters come from{' '}
          <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer">
            themoviedb.org
          </a>
          .
        </p>
      </section>
      <section aria-labelledby="credits-letterboxd">
        <h3 id="credits-letterboxd">Letterboxd</h3>
        <p>
          Letterboxd data comes from public Letterboxd pages. movie-nite is not affiliated with
          Letterboxd.
        </p>
      </section>
      <section aria-labelledby="credits-sounds">
        <h3 id="credits-sounds">Sounds</h3>
        <ul>
          {soundCredits.map((c) => (
            <li key={c.file}>
              {c.what}:{' '}
              <a href={c.sourceUrl} target="_blank" rel="noreferrer">
                {c.source}
              </a>{' '}
              by {c.author} ({c.license})
            </li>
          ))}
        </ul>
      </section>
      <div className="confirm-actions">
        <button type="button" className="quiet" onClick={dismiss}>
          Close
        </button>
      </div>
    </dialog>
  )
}
