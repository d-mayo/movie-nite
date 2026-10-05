import { expect, test } from 'vitest'
import config from './vite.config.ts'

test('serves from the GitHub Pages project path', () => {
  expect(config.base).toBe('/movie-nite/')
})
