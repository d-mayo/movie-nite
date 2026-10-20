import type { AppStore } from './store.ts'

// Opening the app with ?fff unlocks the FFF cards on this browser for good, then takes the
// parameter out of the address bar, keeping the path, the other parameters and the hash.
export function applyFffLink(
  store: Pick<AppStore, 'getState'>,
  location: Pick<Location, 'pathname' | 'search' | 'hash'>,
  history: Pick<History, 'replaceState' | 'state'>,
): void {
  const params = new URLSearchParams(location.search)
  if (!params.has('fff')) return
  store.getState().setFffUnlocked(true)
  // The other parameters are kept as written, so a bare ?debug stays ?debug.
  const query = location.search
    .replace(/^\?/, '')
    .split('&')
    .filter((pair) => pair !== '' && pair.split('=')[0] !== 'fff')
    .join('&')
  history.replaceState(history.state, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`)
}
