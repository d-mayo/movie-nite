// True on a device whose main pointer can hover (a mouse, not touch). jsdom has
// no matchMedia, so a missing one means it cannot. Read on each use, never at
// module load, so tests can stub it.
export function canHover(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches
  )
}
