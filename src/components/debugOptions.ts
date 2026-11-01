import { useCallback, useState } from 'react'

// The unsaved forces the debug popover sets: they start off and reset on reload.
export interface DebugOptions {
  closeCalls: boolean
  catches: boolean
  countdowns: boolean
  wildcards: boolean
  // The id of the card every dealt card is, when it is eligible ('' deals normally).
  card: string
}

export const defaultDebugOptions: DebugOptions = {
  closeCalls: false,
  catches: false,
  countdowns: false,
  wildcards: false,
  card: '',
}

// Whether the page was opened with the debug query flag, read once.
export function useDebugFlag(): boolean {
  const [flag] = useState(() => new URLSearchParams(window.location.search).has('debug'))
  return flag
}

export function useDebugOptions() {
  const [options, setOptions] = useState<DebugOptions>(defaultDebugOptions)
  const update = useCallback((change: Partial<DebugOptions>) => setOptions((o) => ({ ...o, ...change })), [])
  return [options, update] as const
}
