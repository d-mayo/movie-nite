// Letterboxd redirects this address to the film's own page.
export function letterboxdFilmUrl(tmdbId: number): string {
  return `https://letterboxd.com/tmdb/${tmdbId}/`
}
