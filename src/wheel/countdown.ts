// The film-leader countdown that now and then comes before a spin's wind-up: pure rules, no
// React or sound. One spin in ten rolls it, at the press.

// A spin has a countdown when its roll is at or above 1 minus this.
export const countdownChance = 1 / 10
// The numbers it shows, in order, and how long each stays.
export const countdownNumbers = [3, 2, 1] as const
export const countdownStepMs = 520

export function rollsCountdown(roll: number): boolean {
  return roll >= 1 - countdownChance
}
