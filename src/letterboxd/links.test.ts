import { describe, expect, it } from 'vitest'
import { letterboxdFilmUrl, letterboxdProfileUrl, parseLetterboxdUsername } from './links'

describe('letterboxdFilmUrl', () => {
  it('builds the TMDB redirect address with a trailing slash', () => {
    expect(letterboxdFilmUrl(603)).toBe('https://letterboxd.com/tmdb/603/')
  })
})

describe('letterboxdProfileUrl', () => {
  it('builds the profile address with a trailing slash', () => {
    expect(letterboxdProfileUrl('jo')).toBe('https://letterboxd.com/jo/')
  })
})

describe('parseLetterboxdUsername', () => {
  it.each(['Jo', '@jo', 'letterboxd.com/jo', 'https://www.letterboxd.com/Jo/films/', ' jo ', 'http://letterboxd.com/jo'])(
    'reduces %j to jo',
    (input) => {
      expect(parseLetterboxdUsername(input)).toBe('jo')
    },
  )

  it.each([
    '',
    'jo smith',
    'jo.smith',
    'a'.repeat(16),
    'probe',
    'Probe',
    'https://example.com/jo',
    'letterboxd.com/film/dune/',
    'https://letterboxd.com/tmdb/603/',
    'letterboxd.com',
    'films',
  ])('refuses %j', (input) => {
    expect(parseLetterboxdUsername(input)).toBeNull()
  })
})
