import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import Slider from './Slider.tsx'

function setup(props: Partial<React.ComponentProps<typeof Slider>> = {}) {
  const onChange = vi.fn()
  const view = render(
    <Slider label="Weight" value={5} step={0.5} min={0.5} max={20} onChange={onChange} {...props} />,
  )
  return { onChange, view, input: screen.getByLabelText('Weight') as HTMLInputElement }
}

test('the range is found by its label, keeps its attributes and reports numbers', () => {
  const { input, onChange } = setup()
  expect(input).toHaveAttribute('type', 'range')
  expect(input).toHaveAttribute('min', '0.5')
  expect(input).toHaveAttribute('max', '20')
  expect(input).toHaveAttribute('step', '0.5')
  expect(input).toHaveValue('5')
  fireEvent.change(input, { target: { value: '7.5' } })
  expect(onChange).toHaveBeenCalledWith(7.5)
})

test('the value sits in an output in the label row', () => {
  const { view } = setup()
  const row = view.container.querySelector('.slider-row')!
  expect(row).toHaveTextContent('Weight5')
  expect(row.querySelector('output')).toHaveTextContent('5')
})

test('a formatter sets the shown value and aria-valuetext', () => {
  const { view, input } = setup({ value: 6, format: (n) => `${n} s` })
  expect(view.container.querySelector('output')).toHaveTextContent('6 s')
  expect(input).toHaveAttribute('aria-valuetext', '6 s')
})

test.each([
  [0.5, '0%'],
  [20, '100%'],
  [10.25, '50%'],
])('--fill at %s is %s', (value, fill) => {
  const { input } = setup({ value })
  expect(input.style.getPropertyValue('--fill')).toBe(fill)
})
