import { expect, test } from 'vitest'
import { retryDelaySeconds } from './retry'

test('the retries wait 15, 30 and 60 s, then 2 minutes each', () => {
  expect([1, 2, 3, 4, 5, 6].map(retryDelaySeconds)).toEqual([15, 30, 60, 120, 120, 120])
  expect(retryDelaySeconds(50)).toBe(120)
})
