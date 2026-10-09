import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import Stepper from './Stepper.tsx'

function setup(props: Partial<React.ComponentProps<typeof Stepper>> = {}) {
  const onChange = vi.fn()
  const view = render(
    <Stepper label="Slices for Ann" value={3} min={1} max={12} onChange={onChange} {...props} />,
  )
  const ticks = () => Array.from(view.container.querySelectorAll('.stepper-tick'))
  return { onChange, ticks, group: screen.getByRole('group', { name: 'Slices for Ann' }) }
}

test('shows the value and fills the ticks up to it', () => {
  const { ticks, group } = setup()
  expect(group.querySelector('output')).toHaveTextContent('3')
  expect(ticks()).toHaveLength(12)
  expect(ticks().filter((t) => t.getAttribute('data-filled') === 'true')).toHaveLength(3)
})

test('+ and − change the value by one', () => {
  const { onChange } = setup()
  fireEvent.click(screen.getByRole('button', { name: 'Increase Slices for Ann' }))
  expect(onChange).toHaveBeenLastCalledWith(4)
  fireEvent.click(screen.getByRole('button', { name: 'Decrease Slices for Ann' }))
  expect(onChange).toHaveBeenLastCalledWith(2)
})

test.each([
  ['Increase Slices for Ann', 12],
  ['Decrease Slices for Ann', 1],
])('%s at its limit does nothing and keeps focus', (name, value) => {
  const { onChange } = setup({ value })
  const button = screen.getByRole('button', { name })
  button.focus()
  expect(button).toHaveAttribute('aria-disabled', 'true')
  fireEvent.click(button)
  expect(onChange).not.toHaveBeenCalled()
  expect(button).toHaveFocus()
})

test('a click on a tick sets that value', () => {
  const { onChange, ticks } = setup()
  fireEvent.click(ticks()[6])
  expect(onChange).toHaveBeenCalledWith(7)
})

test('arrow keys, Home and End change the value, never past the range', () => {
  const { onChange, group } = setup()
  for (const [key, want] of [
    ['ArrowUp', 4],
    ['ArrowRight', 4],
    ['ArrowDown', 2],
    ['ArrowLeft', 2],
    ['Home', 1],
    ['End', 12],
  ] as const) {
    onChange.mockClear()
    fireEvent.keyDown(group, { key })
    expect(onChange, key).toHaveBeenCalledWith(want)
  }
})

test('keys past the range call nothing', () => {
  const { onChange, group } = setup({ value: 12 })
  fireEvent.keyDown(group, { key: 'ArrowUp' })
  fireEvent.keyDown(group, { key: 'End' })
  expect(onChange).not.toHaveBeenCalled()
})

test('with min 0 and value 0 no tick is filled and − is unavailable', () => {
  const { ticks } = setup({ value: 0, min: 0 })
  expect(ticks().some((t) => t.getAttribute('data-filled') === 'true')).toBe(false)
  expect(screen.getByRole('button', { name: 'Decrease Slices for Ann' })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
})

test('with max 5 there are still 12 ticks and those above do nothing', () => {
  const { onChange, ticks } = setup({ max: 5 })
  expect(ticks()).toHaveLength(12)
  fireEvent.click(ticks()[7])
  expect(onChange).not.toHaveBeenCalled()
  fireEvent.click(ticks()[4])
  expect(onChange).toHaveBeenCalledWith(5)
})

test('the ticks are not focusable and are hidden from the accessibility tree', () => {
  const { ticks } = setup()
  expect(ticks()[0].parentElement).toHaveAttribute('aria-hidden', 'true')
  expect(ticks()[0]).not.toHaveAttribute('tabindex')
})
