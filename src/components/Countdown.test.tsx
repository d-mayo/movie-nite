import { render } from '@testing-library/react'
import { expect, test } from 'vitest'
import Countdown from './Countdown.tsx'

test('the dial shows its number, is hidden from assistive tech and changes with it', () => {
  const { getByTestId, rerender } = render(<Countdown number={3} />)
  const dial = getByTestId('countdown')
  expect(dial).toHaveAttribute('aria-hidden', 'true')
  expect(dial).toHaveTextContent('3')
  expect(dial.querySelector('button, a, input, [tabindex]')).toBeNull()
  const hand = getByTestId('countdown-hand')
  rerender(<Countdown number={2} />)
  expect(getByTestId('countdown')).toHaveTextContent('2')
  // A new number starts a fresh sweep: its hand is a new element.
  expect(getByTestId('countdown-hand')).not.toBe(hand)
})
