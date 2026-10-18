import { useEffect, useRef, useState, type FormEvent } from 'react'
import { letterboxdProfileUrl, parseLetterboxdUsername } from '../letterboxd/links.ts'
import type { Viewer } from '../state/model.ts'
import { useApp } from '../state/store.ts'
import { prefersReducedMotion, watchReducedMotion } from '../wheel/reducedMotion.ts'

// Letterboxd's three-dot mark, readable at a size where the wordmark isn't.
function LetterboxdMark() {
  return (
    <svg className="lb-mark" viewBox="0 0 24 10" width="20" height="9" aria-hidden="true">
      <circle cx="4.5" cy="5" r="4.2" fill="#ff8000" />
      <circle cx="12" cy="5" r="4.2" fill="#00e054" />
      <circle cx="19.5" cy="5" r="4.2" fill="#40bcf4" />
    </svg>
  )
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion)
  useEffect(() => watchReducedMotion(setReduced), [])
  return reduced
}

const profileLinkProps = (username: string) => ({
  href: letterboxdProfileUrl(username),
  target: '_blank',
  rel: 'noopener noreferrer',
})

// The cell head's Letterboxd icon, beside the header button so pressing it never opens or
// closes the panel. A link to the profile once found or while checking; a dimmed, focusable
// warning when Letterboxd says there is no such profile; nothing while unlinked.
export function LetterboxdIcon({ viewer, waiting }: { viewer: Viewer; waiting: boolean }) {
  const reduced = useReducedMotion()
  const link = viewer.letterboxd
  if (!link) return null
  if (link.status === 'missing') {
    const label = `No Letterboxd profile called ${link.username}`
    return (
      <span className="cell-lb cell-lb-missing" role="img" tabIndex={0} aria-label={label} title={label}>
        <LetterboxdMark />
        <span className="lb-warning" aria-hidden="true">
          !
        </span>
      </span>
    )
  }
  const label =
    link.status === 'found'
      ? `${viewer.name} on Letterboxd`
      : waiting
        ? `Can't reach Letterboxd for ${viewer.name}, trying again soon`
        : `Checking ${viewer.name}'s Letterboxd profile…`
  return (
    <a className="cell-lb" {...profileLinkProps(link.username)} aria-label={label} title={label}>
      <LetterboxdMark />
      {link.status === 'pending' && (
        <span className={reduced ? 'lb-spinner' : 'lb-spinner turning'} data-testid="lb-spinner" aria-hidden="true" />
      )}
    </a>
  )
}

// The open panel's Letterboxd row: a username field while unlinked, else the username and Unlink.
// Linking saves at once; the background check (useProfileChecks) settles the status.
export function LetterboxdRow({ viewer, waiting }: { viewer: Viewer; waiting: boolean }) {
  const { linkLetterboxd, unlinkLetterboxd } = useApp()
  const link = viewer.letterboxd
  const [text, setText] = useState('')
  const [invalid, setInvalid] = useState(false)
  const field = useRef<HTMLInputElement>(null)
  const unlink = useRef<HTMLButtonElement>(null)
  // Where focus goes once the row swaps between field and username, so it stays in the panel.
  const focusNext = useRef<'field' | 'unlink' | null>(null)
  useEffect(() => {
    if (focusNext.current === 'unlink') unlink.current?.focus()
    if (focusNext.current === 'field') field.current?.focus()
    focusNext.current = null
  }, [link?.username])

  function submit(e: FormEvent) {
    e.preventDefault()
    const username = parseLetterboxdUsername(text)
    if (!username) {
      setInvalid(true)
      return
    }
    focusNext.current = 'unlink'
    setText('')
    linkLetterboxd(viewer.id, username)
  }

  let message = ''
  if (!link && invalid) message = "That isn't a Letterboxd username"
  else if (link?.status === 'pending') {
    message = waiting ? "Letterboxd can't be reached right now. Trying again soon." : 'Checking…'
  } else if (link?.status === 'missing') message = `No Letterboxd profile called ${link.username}`

  const fieldId = `lb-field-${viewer.id}`
  return (
    <div className="lb-row">
      <LetterboxdMark />
      {link ? (
        <>
          {link.status === 'missing' ? (
            <span className="lb-username">{link.username}</span>
          ) : (
            <a className="lb-username" {...profileLinkProps(link.username)}>
              {link.username}
            </a>
          )}
          <button
            type="button"
            ref={unlink}
            className="quiet lb-unlink"
            aria-label={`Unlink ${viewer.name}'s Letterboxd`}
            onClick={() => {
              focusNext.current = 'field'
              setInvalid(false)
              unlinkLetterboxd(viewer.id)
            }}
          >
            Unlink
          </button>
        </>
      ) : (
        <form className="lb-form" onSubmit={submit}>
          <label className="visually-hidden" htmlFor={fieldId}>
            Letterboxd username for {viewer.name}
          </label>
          <input
            id={fieldId}
            ref={field}
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="Letterboxd username"
            value={text}
            aria-invalid={invalid || undefined}
            onChange={(e) => {
              setText(e.target.value)
              setInvalid(false)
            }}
          />
          <button type="submit" className="quiet">
            Link
          </button>
        </form>
      )}
      <p className="lb-message" role="status">
        {message}
      </p>
    </div>
  )
}
