// Letterboxd redirects this address to the film's own page.
export function letterboxdFilmUrl(tmdbId: number): string {
  return `https://letterboxd.com/tmdb/${tmdbId}/`
}

export function letterboxdProfileUrl(username: string): string {
  return `https://letterboxd.com/${username}/`
}

// The pattern the Worker checks too: one path segment, so nothing else reaches the Letterboxd fetch.
export const usernamePattern = /^[A-Za-z0-9_]{1,15}$/

// Letterboxd's own sections, which a pasted address can start with but no profile can be called,
// and the Worker's probe route.
const reserved = new Set([
  'film',
  'films',
  'tmdb',
  'list',
  'lists',
  'members',
  'search',
  'settings',
  'journal',
  'activity',
  'about',
  'pro',
  'probe',
])

// Whether a value is a username the app can link (D7, D8).
export function isLinkableUsername(value: unknown): value is string {
  return typeof value === 'string' && usernamePattern.test(value) && !reserved.has(value.toLowerCase())
}

// A typed or pasted value as a lowercased username: a bare name, an @name, or a profile address
// (with or without https://, www. or a trailing path). Null when it can't be one.
export function parseLetterboxdUsername(input: string): string | null {
  let value = input.trim()
  const address = /^(?:https?:\/\/)?(?:www\.)?letterboxd\.com(?:\/([^/?#]*))?/i.exec(value)
  if (address) value = address[1] ?? ''
  else if (value.startsWith('@')) value = value.slice(1)
  return isLinkableUsername(value) ? value.toLowerCase() : null
}
