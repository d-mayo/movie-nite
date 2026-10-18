import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type RefObject, type SyntheticEvent } from 'react'
import { letterboxdProfileUrl, parseLetterboxdUsername } from '../letterboxd/links.ts'
import type { Viewer } from '../state/model.ts'
import { useApp } from '../state/store.ts'
import { prefersReducedMotion, watchReducedMotion } from '../wheel/reducedMotion.ts'
import { placeUnder } from './placePopover.ts'

// Letterboxd's three-dot mark, readable at a size where the wordmark isn't.
function LetterboxdMark({ width }: { width: number }) {
  return (
    <svg className="lb-mark" viewBox="0 0 24 10" width={width} height={(width * 10) / 24} aria-hidden="true">
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

// What a linked viewer's check says, as a tooltip: the username once found.
function statusText(viewer: Viewer, waiting: boolean): string {
  const link = viewer.letterboxd
  if (!link) return 'Link Letterboxd'
  if (link.status === 'found') return link.username
  if (link.status === 'missing') return `No Letterboxd profile called ${link.username}`
  return waiting
    ? `${link.username}: Letterboxd can't be reached, trying again soon`
    : `${link.username}: checking…`
}

const cellIconSize = 22

// The cell head's Letterboxd icon, a sibling of the header button so pressing it never opens or
// closes the panel, placed over the empty slot the header leaves after the viewer's name. A link
// to the profile once found or while checking (hover shows the username); a dimmed, focusable
// warning when Letterboxd says there is no such profile; nothing while unlinked.
export function LetterboxdIcon({
  viewer,
  waiting,
  slot,
}: {
  viewer: Viewer
  waiting: boolean
  slot: RefObject<HTMLElement | null>
}) {
  const reduced = useReducedMotion()
  const anchor = useRef<HTMLSpanElement>(null)
  const placeRef = useRef<(() => void) | null>(null)
  const linked = viewer.letterboxd !== undefined
  useLayoutEffect(() => {
    const el = anchor.current
    const slotEl = slot.current
    const head = el?.parentElement
    if (!el || !slotEl || !head) return
    function place() {
      if (!el || !slotEl || !head) return
      const s = slotEl.getBoundingClientRect()
      const h = head.getBoundingClientRect()
      el.style.left = `${Math.round(s.left - h.left + (s.width - cellIconSize) / 2)}px`
      el.style.top = `${Math.round(s.top - h.top + (s.height - cellIconSize) / 2)}px`
    }
    placeRef.current = place
    place()
    window.addEventListener('resize', place)
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(place) : null
    observer?.observe(head)
    observer?.observe(slotEl)
    // The name's row grows when the asterisk appears, moving the slot without resizing it.
    if (slotEl.parentElement) observer?.observe(slotEl.parentElement)
    return () => {
      placeRef.current = null
      window.removeEventListener('resize', place)
      observer?.disconnect()
    }
  }, [slot, linked])
  // The slot also moves, without resizing, when the asterisk after the name comes or goes, and
  // that is a render of this cell, so place again after every one.
  useLayoutEffect(() => {
    placeRef.current?.()
  })
  const link = viewer.letterboxd
  if (!link) return null
  if (link.status === 'missing') {
    const label = `No Letterboxd profile called ${link.username}`
    return (
      <span className="cell-lb-anchor" ref={anchor}>
        <span className="cell-lb cell-lb-missing" role="img" tabIndex={0} aria-label={label} title={label}>
          <LetterboxdMark width={13} />
          <span className="lb-warning" aria-hidden="true">
            !
          </span>
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
    <span className="cell-lb-anchor" ref={anchor}>
      <a className="cell-lb" {...profileLinkProps(link.username)} aria-label={label} title={statusText(viewer, waiting)}>
        <LetterboxdMark width={13} />
        {link.status === 'pending' && (
          <span className={reduced ? 'lb-spinner' : 'lb-spinner turning'} data-testid="lb-spinner" aria-hidden="true" />
        )}
      </a>
    </span>
  )
}

// The panel's Letterboxd icon, in the row with the color swatch and menu. Washed out while
// unlinked: pressing it opens a small popup to enter the username (a pasted profile address works
// too), which links at once; the background check settles the status. Linked, it is the profile
// link, with the username (or the check's state) as its tooltip. Unlink lives in the ⋯ menu.
export function LetterboxdPanelIcon({
  viewer,
  waiting,
  onToggle,
}: {
  viewer: Viewer
  waiting: boolean
  onToggle: (e: SyntheticEvent<HTMLElement>) => void
}) {
  const { linkLetterboxd } = useApp()
  const popover = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [invalid, setInvalid] = useState(false)
  const link = viewer.letterboxd
  const id = `lb-popover-${viewer.id}`
  const fieldId = `lb-field-${viewer.id}`

  function submit(e: FormEvent) {
    e.preventDefault()
    const username = parseLetterboxdUsername(text)
    if (!username) {
      setInvalid(true)
      return
    }
    linkLetterboxd(viewer.id, username)
    popover.current?.hidePopover()
  }

  if (link?.status === 'missing') {
    const label = `No Letterboxd profile called ${link.username}`
    return (
      <span className="lb-panel lb-panel-missing" role="img" tabIndex={0} aria-label={label} title={label}>
        <LetterboxdMark width={20} />
        <span className="lb-warning" aria-hidden="true">
          !
        </span>
      </span>
    )
  }
  if (link) {
    return (
      <a
        className="lb-panel"
        {...profileLinkProps(link.username)}
        aria-label={`Letterboxd profile ${link.username}`}
        title={statusText(viewer, waiting)}
      >
        <LetterboxdMark width={20} />
      </a>
    )
  }
  return (
    <>
      <button
        type="button"
        className="lb-panel lb-panel-unlinked"
        aria-label={`Link Letterboxd for ${viewer.name}`}
        title="Link Letterboxd"
        popoverTarget={id}
        onClick={(e) => placeUnder(e, popover.current)}
      >
        <LetterboxdMark width={20} />
      </button>
      <div
        id={id}
        popover="auto"
        ref={popover}
        className="card lb-popover"
        onToggle={(e) => {
          onToggle(e)
          if ((e.nativeEvent as Event & { newState?: string }).newState === 'open') field.current?.focus()
          else {
            setText('')
            setInvalid(false)
          }
        }}
      >
        <form onSubmit={submit}>
          <label htmlFor={fieldId}>Letterboxd profile for {viewer.name}</label>
          <div className="lb-form">
            <input
              id={fieldId}
              name="lb-profile"
              ref={field}
              type="text"
              autoComplete="off"
              spellCheck={false}
              // Keep password managers (Bitwarden, 1Password, LastPass) from offering a login here.
              data-bwignore="true"
              data-1p-ignore="true"
              data-lpignore="true"
              data-form-type="other"
              placeholder="name or profile address"
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
          </div>
          <p className="field-error" role="status">
            {invalid ? "That isn't a Letterboxd username" : ''}
          </p>
        </form>
      </div>
    </>
  )
}
