import type { Slice } from './layout.ts'

export type SliceRef =
  { kind: 'nomination'; id: string; viewerId: string } | { kind: 'wildcard'; id: string }

export interface ViewerSetting {
  weight: number
  slices: number
}

// The edited wheel. A viewer's per-slice weight is always weight / slices and
// is never stored; every wildcard slice has the one shared wildcardWeight. `viewers` keeps entries for unticked viewers so their
// settings come back when they do.
export interface WheelLayout {
  viewers: Record<string, ViewerSetting>
  wildcardWeight: number
  wildcards: { id: string }[]
  order: SliceRef[]
  handPlaced: boolean
}

export const defaultViewerSetting: ViewerSetting = { weight: 5, slices: 3 }
export const defaultWildcardWeight = 1

const minWeight = 0.5
const maxWeight = 20
const minSlices = 1
const maxSlices = 12

function settingOf(layout: WheelLayout, viewerId: string): ViewerSetting {
  return layout.viewers[viewerId] ?? defaultViewerSetting
}

function freshNominationIds(order: SliceRef[], viewerId: string, count: number): string[] {
  const used = new Set(order.map((r) => r.id))
  const ids: string[] = []
  for (let j = 0; ids.length < count; j++) {
    const id = `${viewerId}#${j}`
    if (!used.has(id)) ids.push(id)
  }
  return ids
}

function freshWildcardId(layout: WheelLayout): string {
  const used = new Set([...layout.wildcards.map((w) => w.id), ...layout.order.map((r) => r.id)])
  for (let n = 0; ; n++) {
    if (!used.has(`w${n}`)) return `w${n}`
  }
}

// Spreads every slice evenly: each viewer's j-th of k slices has the ideal
// position (j + i/n) / k for tick index i of n, and the wildcards are spaced
// evenly among the nomination slices. With three slices and one wildcard per
// viewer this is exactly the default round-robin layout.
export function spreadOrder(layout: WheelLayout, onWheel: string[]): SliceRef[] {
  const n = onWheel.length
  const placed: { ref: SliceRef; j: number; i: number; k: number }[] = []
  onWheel.forEach((viewerId, i) => {
    const k = settingOf(layout, viewerId).slices
    const existing = layout.order.filter((r) => r.kind === 'nomination' && r.viewerId === viewerId)
    const kept = existing.slice(0, k)
    const fresh = freshNominationIds(layout.order, viewerId, k - kept.length)
    const refs: SliceRef[] = [
      ...kept,
      ...fresh.map((id): SliceRef => ({ kind: 'nomination', id, viewerId })),
    ]
    refs.forEach((ref, j) => placed.push({ ref, j, i, k }))
  })
  // Compare (j*n + i) / (k*n) exactly by cross-multiplying.
  placed.sort((a, b) => (a.j * n + a.i) * b.k - (b.j * n + b.i) * a.k || a.i - b.i)
  const nominations = placed.map((p) => p.ref)
  const wildcards = layout.wildcards
  const total = nominations.length
  const order: SliceRef[] = []
  let next = 0
  const after = wildcards.map((_, m) => Math.round(((m + 1) * total) / wildcards.length))
  for (let pos = 0; pos <= total; pos++) {
    while (next < wildcards.length && after[next] === pos) {
      order.push({ kind: 'wildcard', id: wildcards[next].id })
      next++
    }
    if (pos < total) order.push(nominations[pos])
  }
  return order
}

function respread(layout: WheelLayout, onWheel: string[]): WheelLayout {
  return { ...layout, order: spreadOrder(layout, onWheel) }
}

export function materialiseDefault(onWheel: string[]): WheelLayout {
  const viewers: Record<string, ViewerSetting> = {}
  for (const id of onWheel) viewers[id] = { ...defaultViewerSetting }
  const base: WheelLayout = {
    viewers,
    wildcardWeight: defaultWildcardWeight,
    wildcards: onWheel.map((_, i) => ({ id: `w${i}` })),
    order: [],
    handPlaced: false,
  }
  return respread(base, onWheel)
}

export function resolveLayout(layout: WheelLayout): Slice[] {
  return layout.order.map((ref): Slice => {
    if (ref.kind === 'wildcard') {
      return { kind: 'wildcard', weight: layout.wildcardWeight }
    }
    const setting = settingOf(layout, ref.viewerId)
    return {
      kind: 'nomination',
      viewerId: ref.viewerId,
      weight: setting.weight / setting.slices,
    }
  })
}

export function isValidWeight(weight: number): boolean {
  return (
    Number.isFinite(weight) &&
    weight >= minWeight &&
    weight <= maxWeight &&
    Number.isInteger(weight * 2)
  )
}

export function isValidSliceCount(count: number): boolean {
  return Number.isInteger(count) && count >= minSlices && count <= maxSlices
}

export function setViewerWeight(
  layout: WheelLayout,
  viewerId: string,
  weight: number,
): WheelLayout {
  if (!isValidWeight(weight) || !layout.viewers[viewerId]) return layout
  return {
    ...layout,
    viewers: {
      ...layout.viewers,
      [viewerId]: { ...layout.viewers[viewerId], weight },
    },
  }
}

function addSliceInLargestGap(order: SliceRef[], viewerId: string, id: string): SliceRef[] {
  const length = order.length
  const positions = order.flatMap((r, i) =>
    r.kind === 'nomination' && r.viewerId === viewerId ? [i] : [],
  )
  let bestGap = -1
  let at = 0
  positions.forEach((p, i) => {
    const gap = i + 1 < positions.length ? positions[i + 1] - p : positions[0] + length - p
    if (gap > bestGap) {
      bestGap = gap
      at = p + Math.ceil(gap / 2)
    }
  })
  if (positions.length === 0) at = length
  if (at > length) at -= length
  const next = [...order]
  next.splice(at, 0, { kind: 'nomination', id, viewerId })
  return next
}

function removeLastSlice(order: SliceRef[], viewerId: string): SliceRef[] {
  for (let i = order.length - 1; i >= 0; i--) {
    const r = order[i]
    if (r.kind === 'nomination' && r.viewerId === viewerId) {
      return order.filter((_, at) => at !== i)
    }
  }
  return order
}

export function setViewerSlices(
  layout: WheelLayout,
  onWheel: string[],
  viewerId: string,
  count: number,
): WheelLayout {
  const current = layout.viewers[viewerId]
  if (!isValidSliceCount(count) || !current || count === current.slices) return layout
  const next: WheelLayout = {
    ...layout,
    viewers: { ...layout.viewers, [viewerId]: { ...current, slices: count } },
  }
  if (!layout.handPlaced) return respread(next, onWheel)
  let order = layout.order
  for (let have = current.slices; have < count; have++) {
    order = addSliceInLargestGap(order, viewerId, freshNominationIds(order, viewerId, 1)[0])
  }
  for (let have = current.slices; have > count; have--) {
    order = removeLastSlice(order, viewerId)
  }
  return { ...next, order }
}

export function setWildcardWeight(layout: WheelLayout, weight: number): WheelLayout {
  if (!isValidWeight(weight)) return layout
  return { ...layout, wildcardWeight: weight }
}

export function addWildcard(layout: WheelLayout, onWheel: string[]): WheelLayout {
  const id = freshWildcardId(layout)
  const next: WheelLayout = {
    ...layout,
    wildcards: [...layout.wildcards, { id }],
  }
  if (!layout.handPlaced) return respread(next, onWheel)
  return { ...next, order: [...layout.order, { kind: 'wildcard', id }] }
}

export function removeWildcard(layout: WheelLayout, onWheel: string[], id: string): WheelLayout {
  if (!layout.wildcards.some((w) => w.id === id)) return layout
  const next: WheelLayout = {
    ...layout,
    wildcards: layout.wildcards.filter((w) => w.id !== id),
    order: layout.order.filter((r) => r.id !== id),
  }
  return layout.handPlaced ? next : respread(next, onWheel)
}

// Moving a slice by hand makes the order hand-placed for good.
export function moveSlice(layout: WheelLayout, from: number, to: number): WheelLayout {
  const { length } = layout.order
  if (from === to || from < 0 || to < 0 || from >= length || to >= length) return layout
  const order = [...layout.order]
  const [moved] = order.splice(from, 1)
  order.splice(to, 0, moved)
  return { ...layout, order, handPlaced: true }
}

export function spreadEvenly(layout: WheelLayout, onWheel: string[]): WheelLayout {
  return respread(layout, onWheel)
}

export function forgetViewer(layout: WheelLayout, viewerId: string): WheelLayout {
  if (!layout.viewers[viewerId]) return layout
  const { [viewerId]: _dropped, ...viewers } = layout.viewers
  void _dropped
  return { ...layout, viewers }
}

function firstWildcardClockwise(order: SliceRef[], from: number): number {
  for (let step = 1; step <= order.length; step++) {
    const at = (from + step) % order.length
    if (order[at].kind === 'wildcard') return at
  }
  return -1
}

function takeLeaver(layout: WheelLayout, viewerId: string): WheelLayout {
  const first = layout.order.findIndex((r) => r.kind === 'nomination' && r.viewerId === viewerId)
  const wildcardAt = firstWildcardClockwise(layout.order, first)
  const wildcardId = wildcardAt >= 0 ? layout.order[wildcardAt].id : null
  return {
    ...layout,
    wildcards: layout.wildcards.filter((w) => w.id !== wildcardId),
    order: layout.order.filter(
      (r) => r.id !== wildcardId && !(r.kind === 'nomination' && r.viewerId === viewerId),
    ),
  }
}

// Spreads the joiner's slices evenly through the current order, with their
// wildcard right after their last slice; everything else keeps its order.
function placeJoiner(layout: WheelLayout, viewerId: string): WheelLayout {
  const { slices } = settingOf(layout, viewerId)
  const length = layout.order.length
  const ids = freshNominationIds(layout.order, viewerId, slices)
  const wildcardId = freshWildcardId(layout)
  const before = Array.from({ length: slices }, (_, j) =>
    Math.floor(((2 * j + 1) * length) / (2 * slices)),
  )
  const order: SliceRef[] = []
  for (let i = 0; i <= length; i++) {
    before.forEach((at, j) => {
      if (at !== i) return
      order.push({ kind: 'nomination', id: ids[j], viewerId })
      if (j === slices - 1) order.push({ kind: 'wildcard', id: wildcardId })
    })
    if (i < length) order.push(layout.order[i])
  }
  return {
    ...layout,
    wildcards: [...layout.wildcards, { id: wildcardId }],
    order,
  }
}

// Brings the layout in line with who is on the wheel: leavers take their
// slices and a wildcard, joiners are added with their kept (or default)
// settings, and an auto-spread order is spread again. Returns the same
// layout when nobody left or joined.
export function syncLayout(layout: WheelLayout, onWheel: string[]): WheelLayout {
  const inLayout: string[] = []
  for (const r of layout.order) {
    if (r.kind === 'nomination' && !inLayout.includes(r.viewerId)) inLayout.push(r.viewerId)
  }
  const leavers = inLayout.filter((id) => !onWheel.includes(id))
  const joiners = onWheel.filter((id) => !inLayout.includes(id))
  if (leavers.length === 0 && joiners.length === 0) return layout

  let next = layout
  for (const id of leavers) next = takeLeaver(next, id)
  if (onWheel.length === 0) next = { ...next, wildcards: [], order: [] }
  for (const id of joiners) {
    if (!next.viewers[id]) {
      next = {
        ...next,
        viewers: { ...next.viewers, [id]: { ...defaultViewerSetting } },
      }
    }
    if (next.handPlaced) {
      next = placeJoiner(next, id)
    } else {
      next = {
        ...next,
        wildcards: [...next.wildcards, { id: freshWildcardId(next) }],
      }
    }
  }
  return next.handPlaced ? next : respread(next, onWheel)
}

// Brings a stored layout up to the current shape: wildcards used to carry a
// weight each, and weights used to go up to 99.
export function normaliseLayout(raw: unknown): WheelLayout {
  const layout = raw as Omit<WheelLayout, 'wildcards' | 'wildcardWeight'> & {
    wildcardWeight?: number
    wildcards?: { id: string; weight?: number }[]
  }
  const wildcards = layout.wildcards ?? []
  const wildcardWeight = layout.wildcardWeight ?? wildcards[0]?.weight ?? defaultWildcardWeight
  const viewers: Record<string, ViewerSetting> = {}
  for (const [id, setting] of Object.entries(layout.viewers ?? {})) {
    viewers[id] = { ...setting, weight: Math.min(setting.weight, maxWeight) }
  }
  return {
    ...layout,
    viewers,
    wildcardWeight: Math.min(wildcardWeight, maxWeight),
    wildcards: wildcards.map((w) => ({ id: w.id })),
  }
}
