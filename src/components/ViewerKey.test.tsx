import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { addCardEffect, addViewer, defaultState, setViewersHidden } from '../state/model.ts'
import { createMemoryPersistence } from '../state/persistence.ts'
import { AppStoreContext, createAppStore } from '../state/store.ts'
import { defaultWheelSettings } from '../wheel/edit.ts'
import type { CardEffect } from '../wildcards/cards.ts'
import ViewerKey from './ViewerKey.tsx'

const blind = (used: boolean): CardEffect => ({
  cardId: 'blind-spin',
  label: 'Blind spin',
  change: { kind: 'blindSpin', used },
})

function mount(blindSpin?: CardEffect) {
  let state = setViewersHidden(addViewer(defaultState, 'Ann', 'a'), true)
  state = {
    ...state,
    settings: { ...state.settings, wheel: { ...defaultWheelSettings, showLabels: false } },
  }
  if (blindSpin) state = addCardEffect(state, blindSpin)
  render(
    <AppStoreContext.Provider value={createAppStore(createMemoryPersistence(state))}>
      <ViewerKey />
    </AppStoreContext.Provider>,
  )
}

test('the key shows with labels off and the pane hidden', () => {
  mount()
  expect(screen.getByRole('list', { name: "Tonight's viewers" })).toBeInTheDocument()
})

test('the key is hidden while a Blind Spin is pending, and back once it is used', () => {
  mount(blind(false))
  expect(screen.queryByRole('list', { name: "Tonight's viewers" })).toBeNull()
})

test('a used Blind Spin leaves the key showing', () => {
  mount(blind(true))
  expect(screen.getByRole('list', { name: "Tonight's viewers" })).toBeInTheDocument()
})
