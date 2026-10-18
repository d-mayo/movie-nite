// How long to wait before retrying an unavailable profile check: 15 s, 30 s, 60 s, then every
// 2 minutes for as long as the app is open. `attempt` counts the unavailable answers so far, from 1.
const schedule = [15, 30, 60]
const steady = 120

export function retryDelaySeconds(attempt: number): number {
  return schedule[attempt - 1] ?? steady
}
