export type ProfileCheck = 'found' | 'missing' | 'unavailable'

export interface LetterboxdClient {
  checkProfile(username: string, signal?: AbortSignal): Promise<ProfileCheck>
}

// The Worker's `/lb/<user>` route: found only when it names the user asked for, missing only on its
// own "No such profile" 404 (so a route it doesn't know never reads as missing), else unavailable.
export function createLetterboxdClient(
  apiBase: string,
  fetchFn: typeof fetch = (...args) => fetch(...args),
): LetterboxdClient {
  return {
    async checkProfile(username, signal) {
      try {
        const response = await fetchFn(`${apiBase}/lb/${encodeURIComponent(username)}`, {
          headers: { Accept: 'application/json' },
          signal,
        })
        const body = (await response.json()) as { username?: unknown; error?: unknown } | null
        if (response.status === 200 && body?.username === username) return 'found'
        if (response.status === 404 && body?.error === 'No such profile') return 'missing'
        return 'unavailable'
      } catch (error) {
        if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
          throw error
        }
        return 'unavailable'
      }
    },
  }
}
