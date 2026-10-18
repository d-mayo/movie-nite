import { describe, expect, it } from 'vitest'
import { letterboxdFilmUrl } from './links'

describe('letterboxdFilmUrl', () => {
  it('builds the TMDB redirect address with a trailing slash', () => {
    expect(letterboxdFilmUrl(603)).toBe('https://letterboxd.com/tmdb/603/')
  })
})
