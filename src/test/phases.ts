import { screen } from '@testing-library/react'

export interface StageRecord {
  // The stage's data-transition, data-fade and data-wheel at the time.
  phase: string | null
  fade: string | null
  wheel: string | null
  // Every wedge on the wheel is a card.
  cards: boolean
  clapper: boolean
  cueMark: boolean
  // The Ann viewer toggle is disabled, which is the night's lock.
  locked: boolean
  spinDisabled: boolean
}

// Records the stage's state at each change to its attributes or contents, so a test can read the
// transition phases in order.
export function recordStage() {
  const stage = document.querySelector('.wheel-stage')!
  const records: StageRecord[] = []
  const snapshot = () => {
    const kinds = screen.queryAllByTestId('wedge').map((w) => w.getAttribute('data-kind'))
    const toggle = screen.queryByRole('button', { name: 'Ann is here' })
    const spin = screen.queryByRole('button', { name: 'Spin' })
    const record: StageRecord = {
      phase: stage.getAttribute('data-transition'),
      fade: stage.getAttribute('data-fade'),
      wheel: stage.getAttribute('data-wheel'),
      cards: kinds.length > 0 && kinds.every((k) => k === 'card'),
      clapper: stage.querySelector('[data-testid="clapper"]') !== null,
      cueMark: stage.querySelector('[data-testid="cue-mark"]') !== null,
      locked: toggle?.matches(':disabled') ?? false,
      spinDisabled: spin?.matches(':disabled') ?? false,
    }
    const last = records[records.length - 1]
    if (!last || JSON.stringify(last) !== JSON.stringify(record)) records.push(record)
  }
  const observer = new MutationObserver(snapshot)
  observer.observe(stage, { attributes: true, childList: true, subtree: true })
  return {
    records,
    // The phases the stage went through, in order.
    phases: () => records.map((r) => r.phase).filter((p, i, all): p is string => p !== null && p !== all[i - 1]),
    stop: () => observer.disconnect(),
  }
}
