import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import ErrorScreen from './ErrorScreen.tsx'

function Broken(): never {
  throw new Error('broken')
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

test('shows its children while nothing fails', () => {
  render(
    <ErrorScreen onReset={() => {}}>
      <p>Fine</p>
    </ErrorScreen>,
  )
  expect(screen.getByText('Fine')).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('a crash shows the error screen, and Reload reloads without resetting', () => {
  const onReset = vi.fn()
  const onReload = vi.fn()
  render(
    <ErrorScreen onReset={onReset} onReload={onReload}>
      <Broken />
    </ErrorScreen>,
  )
  expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong')
  fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
  expect(onReload).toHaveBeenCalledTimes(1)
  expect(onReset).not.toHaveBeenCalled()
})

test('the reset asks first, then deletes the saved data and reloads', () => {
  const calls: string[] = []
  render(
    <ErrorScreen onReset={() => calls.push('reset')} onReload={() => calls.push('reload')}>
      <Broken />
    </ErrorScreen>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Reset saved data…' }))
  expect(calls).toEqual([])
  fireEvent.click(screen.getByRole('button', { name: 'Delete everything and reload' }))
  expect(calls).toEqual(['reset', 'reload'])
})
