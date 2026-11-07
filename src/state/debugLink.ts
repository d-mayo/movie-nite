import type { AppStore } from './store.ts'

// Opening the app with ?debug turns the debug options on for this browser, kept until
// ?debug=off turns them off again (and takes that parameter out of the address bar).
export function applyDebugLink(
  store: Pick<AppStore, 'getState'>,
  location: Pick<Location, 'pathname' | 'search' | 'hash'>,
  history: Pick<History, 'replaceState' | 'state'>,
): void {
  const params = new URLSearchParams(location.search)
  if (!params.has('debug')) return
  if (params.get('debug') !== 'off') {
    store.getState().setDebugEnabled(true)
    return
  }
  store.getState().setDebugEnabled(false)
  const query = location.search
    .replace(/^\?/, '')
    .split('&')
    .filter((pair) => pair !== '' && pair.split('=')[0] !== 'debug')
    .join('&')
  history.replaceState(history.state, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`)
}
