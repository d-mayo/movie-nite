import { expect, test } from 'vitest'
import { countdownChance, countdownNumbers, countdownStepMs, rollsCountdown } from './countdown.ts'

test('only the top tenth of the roll counts', () => {
  expect(countdownChance).toBe(0.1)
  expect(rollsCountdown(0.9)).toBe(true)
  expect(rollsCountdown(0.99)).toBe(true)
  expect(rollsCountdown(0.8999)).toBe(false)
  expect(rollsCountdown(0.5)).toBe(false)
  expect(rollsCountdown(0.01)).toBe(false)
})

test('3, 2, 1 at 0.52 s each', () => {
  expect(countdownNumbers).toEqual([3, 2, 1])
  expect(countdownStepMs * countdownNumbers.length).toBe(1560)
})
