import { act, render, screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import App from '../App.tsx'
import { defaultState, type Nomination } from '../state/model.ts'
import { createMemoryPersistence } from '../state/persistence.ts'
import { createAppStore } from '../state/store.ts'
import { presetColors } from '../wheel/colors.ts'
import { addViewer, markAway, markHere, removeViewer } from '../test/cells.ts'
import { defaultWheelSettings } from '../wheel/edit.ts'
import type { Wedge } from '../wheel/wedges.ts'
import { buildCardWedges } from '../wheel/wedges.ts'
import { dealCards } from '../wildcards/deal.ts'
import { seeded } from '../wildcards/seeded.ts'
import Wheel from './Wheel.tsx'

function film(id: number, posterPath: string | null): Nomination {
  return {
    tmdbId: id,
    title: `Film ${id}`,
    year: 2000,
    posterPath,
    overview: '',
    runtime: 100,
    genres: [],
  }
}

function setup() {
  const store = createAppStore(
    createMemoryPersistence({ ...defaultState, settings: { viewersHidden: false, wheel: defaultWheelSettings } }),
  )
  render(<App store={store} fetchFn={vi.fn()} />)
  return store
}

const wedges = () => screen.queryAllByTestId('wedge')
const images = () => document.querySelectorAll('image')

test('with no ticked viewers an empty state shows beside setup', () => {
  setup()
  expect(screen.getByText(/Tick or add viewers/)).toBeInTheDocument()
  expect(wedges()).toHaveLength(0)
  expect(screen.getByText("Tonight's viewers")).toBeInTheDocument()
})

test('the wheel follows viewers and nominations live', () => {
  const store = setup()
  addViewer('Ann')
  expect(wedges()).toHaveLength(4)
  expect(screen.getAllByText('Ann')).not.toHaveLength(0)
  expect(screen.getAllByText('WILDCARD')).toHaveLength(1)
  expect(images()).toHaveLength(0)

  const id = store.getState().roster[0].id
  act(() => store.getState().nominate(id, film(1, '/a.jpg')))
  expect(images()).toHaveLength(3)
  expect(images()[0].getAttribute('href')).toBe('https://image.tmdb.org/t/p/w185/a.jpg')

  act(() => store.getState().nominate(id, film(2, '/b.jpg')))
  expect(images()[0].getAttribute('href')).toBe('https://image.tmdb.org/t/p/w185/b.jpg')

  act(() => store.getState().nominate(id, film(3, null)))
  expect(images()).toHaveLength(0)
  expect(wedges()).toHaveLength(4)
  expect(screen.getByTestId('pointer')).toBeInTheDocument()

  markAway('Ann')
  expect(wedges()).toHaveLength(0)
  markHere('Ann')
  expect(wedges()).toHaveLength(4)

  act(() => store.getState().nominate(id, film(4, '/c.jpg')))

  removeViewer('Ann')
  expect(wedges()).toHaveLength(0)
})

test('a long viewer name shrinks to its room and is set in capitals, a short one is not', () => {
  setup()
  addViewers(['wwwwwwwwwwwwwwwwwwww', 'Ann', 'Bo', 'Cy', 'Di'])
  const texts = Array.from(document.querySelectorAll('svg.wheel text.wheel-label'))
  const long = texts.find((t) => t.textContent === 'W'.repeat(20))!
  expect(Number(long.getAttribute('font-size'))).toBeLessThan(9)
  const ann = texts.find((t) => t.textContent === 'ANN')!
  expect(Number(ann.getAttribute('font-size'))).toBe(9)
  expect(texts.some((t) => t.textContent === 'Ann')).toBe(false)
})

function addViewers(names: string[]) {
  for (const name of names) {
    addViewer(name)
  }
}

test('every label sits on a solid film-stock tag, white name and cream title, in a light and a dark color', () => {
  const store = setup()
  addViewers(['Ann', 'Bo'])
  const [ann, bo] = store.getState().roster
  act(() => store.getState().setViewerColor(ann.id, '#ffe119'))
  act(() => store.getState().setViewerColor(bo.id, presetColors[7]))
  act(() => store.getState().nominate(ann.id, film(1, null)))
  expect(screen.queryAllByTestId('scrim')).toHaveLength(0)
  const tags = screen.getAllByTestId('label-tag')
  expect(tags.length).toBeGreaterThan(0)
  for (const rect of tags) {
    expect(rect.getAttribute('class')).toContain('film-fill-stock')
    expect(rect.hasAttribute('opacity')).toBe(false)
    expect(rect.hasAttribute('fill-opacity')).toBe(false)
    const [name, title] = Array.from(rect.parentElement!.querySelectorAll('text'))
    expect(name.getAttribute('fill')).toBe('#ffffff')
    expect(name.textContent).toBe(name.textContent!.toUpperCase())
    expect(name.getAttribute('class')).toContain('wheel-label')
    if (title) expect(title.getAttribute('class')).toContain('wheel-label-title')
  }
  const titled = screen.getAllByText('FILM 1', { selector: 'text' })
  expect(titled).toHaveLength(3)
  expect(document.querySelector('svg.wheel > g')!.querySelector('[data-testid="reel"]')).not.toBeNull()
})

test('the wheel has the grown viewBox, with the reel turning with the wedges and a fixed gloss', () => {
  const store = setup()
  addViewers(['Ann', 'Bo'])
  const svg = document.querySelector('svg.wheel')!
  expect(svg.getAttribute('viewBox')).toBe('-124 -124 248 248')
  const group = svg.querySelector(':scope > g')!
  const reel = within(group as HTMLElement).getByTestId('reel')
  const frames = within(reel as HTMLElement).getAllByTestId('frame')
  expect(frames).toHaveLength(wedges().length)
  const [ann, bo] = store.getState().roster
  const fills = frames.map((f) => f.getAttribute('fill'))
  expect(fills.filter((f) => f === ann.color)).toHaveLength(3)
  expect(fills.filter((f) => f === bo.color)).toHaveLength(3)
  expect(fills.filter((f) => f === null)).toHaveLength(frames.length - 6)
  const holes = within(reel as HTMLElement).getByTestId('sprocket-holes')
  expect(holes.getAttribute('d')!.match(/M /g)).toHaveLength(288)
  expect(within(reel as HTMLElement).getByTestId('reel-ring').getAttribute('r')).toBe('100')
  const gloss = screen.getByTestId('gloss')
  expect(group.contains(gloss)).toBe(false)
  expect(gloss.getAttribute('pointer-events')).toBe('none')
})

test('wedges fill from shared gradients that run dark at the hub to the viewer color', () => {
  const store = setup()
  addViewers(['Ann', 'Bo'])
  const [ann] = store.getState().roster
  act(() => store.getState().nominate(ann.id, film(1, '/a.jpg')))
  const fillId = (w: Element) => w.querySelector(':scope > path')!.getAttribute('fill')!.slice(5, -1)
  const [annWedge, ...others] = wedges().filter((w) => w.getAttribute('data-kind') === 'nomination')
  const gradient = document.getElementById(fillId(annWedge))!
  const stops = Array.from(gradient.querySelectorAll('stop'))
  expect(stops.map((x) => x.getAttribute('offset'))).toEqual(['0', '0.3', '0.75', '1'])
  expect(stops[2].getAttribute('stop-color')).toBe(ann.color)
  expect(stops[0].getAttribute('stop-color')).not.toBe(ann.color)
  expect(annWedge.querySelector(':scope > path')!.getAttribute('stroke')).toBe('#000000')
  // Ann's three slices share one gradient; the radial ones are two viewers and the gloss.
  const annIds = new Set(
    wedges().filter((w) => w.getAttribute('data-kind') === 'nomination' && fillId(w) === fillId(annWedge)),
  )
  expect(annIds.size).toBe(3)
  expect(others.length).toBeGreaterThan(0)
  expect(document.querySelectorAll('svg.wheel radialGradient')).toHaveLength(3)
  expect(annWedge.querySelectorAll('[data-testid="poster-fade"]')).toHaveLength(1)
})

test('pins sit on the turning strip and the flapper hangs outside it, its tip inside the pins', () => {
  setup()
  addViewers(['Ann', 'Bo'])
  const svg = document.querySelector('svg.wheel')!
  const group = svg.querySelector(':scope > g')!
  expect(svg.querySelector('g')).toBe(group)
  expect(svg.getAttribute('viewBox')).toBe('-124 -124 248 248')
  const pins = within(group as HTMLElement).getAllByTestId('pin')
  expect(pins).toHaveLength(wedges().length)
  const middle = (103.2 + 108.8) / 2
  for (const pin of pins) {
    expect(pin.getAttribute('class')).toBe('film-pin')
    const r = Math.hypot(Number(pin.getAttribute('cx')), Number(pin.getAttribute('cy')))
    expect(r).toBeCloseTo(middle, 1)
    // Half-width under 1.2° of arc, so a pin never looks like a tie.
    expect((Number(pin.getAttribute('r')) / middle) * (180 / Math.PI)).toBeLessThan(1.2)
  }
  const first = pins[0]
  expect(Number(first.getAttribute('cx'))).toBeCloseTo(0, 2)
  expect(Number(first.getAttribute('cy'))).toBeCloseTo(-middle, 1)

  const pointer = screen.getByTestId('pointer')
  expect(group.contains(pointer)).toBe(false)
  const tongue = pointer.querySelector('.film-tongue')!
  const cap = pointer.querySelector('.film-cap')!
  expect(pointer.querySelector('.film-slot')).not.toBeNull()
  expect(Number(cap.getAttribute('cy'))).toBeLessThan(-112)
  const ys = tongue.getAttribute('d')!.match(/-?\d+(\.\d+)?/g)!.map(Number).filter((_, i) => i % 2 === 1)
  const tip = Math.max(...ys)
  const pinInner = middle - Number(first.getAttribute('r')) - 0.3
  expect(-tip).toBeLessThan(pinInner)
  expect(-tip).toBeGreaterThan(100)
})

const wildcards = () => wedges().filter((w) => w.getAttribute('data-kind') === 'wildcard')

test('a wildcard is a clapperboard slate: stock body, the inner stick (the outer one is on the reel frame), the M, and the word in cream', () => {
  setup()
  addViewers(['Ann', 'Bo'])
  const wild = wildcards()
  expect(wild.length).toBeGreaterThan(0)
  for (const w of wild) {
    const body = w.querySelector(':scope > path')!
    expect(body.getAttribute('class')).toBe('film-fill-stock')
    expect(body.hasAttribute('fill')).toBe(false)
    expect(within(w).getAllByTestId('stick')).toHaveLength(1)
    for (const stick of within(w).getAllByTestId('stick')) {
      expect(stick.getAttribute('class')).toBe('film-fill-cream')
    }
    expect(within(w).getAllByTestId('watermark')).toHaveLength(1)
    const word = within(w).getByTestId('wildcard-word')
    expect(word.textContent).toBe('WILDCARD')
    expect(word.getAttribute('class')).toContain('wheel-label-word')
    expect(word.parentElement!.querySelector('rect')).toBeNull()
  }
  // The outer stick is the reel's frame, striped in cream.
  const frameSticks = screen.getAllByTestId('frame-stick')
  expect(frameSticks).toHaveLength(wild.length)
  for (const f of frameSticks) expect(f.getAttribute('class')).toBe('film-fill-cream')
  // The sticks lie in each slice's own turned frame, drawn the same way on every wildcard.
  const sticks = wild.map((w) => within(w).getAllByTestId('stick')[0].getAttribute('d'))
  expect(new Set(sticks).size).toBe(1)
  const turns = wild.map((w) => within(w).getByTestId('sticks').parentElement!.getAttribute('transform'))
  expect(new Set(turns).size).toBe(wild.length)
})

test('a very narrow wildcard has no watermark and shows a ? instead of the word', () => {
  const wedge = {
    arc: { start: 0, end: 1.5 },
    slice: { kind: 'wildcard', weight: 1 },
    color: '#000000',
    viewerName: null,
    nomination: null,
  } as unknown as Wedge
  render(<Wheel wedges={[wedge]} groupRef={null} />)
  expect(screen.queryByTestId('watermark')).toBeNull()
  expect(screen.getByTestId('wildcard-word').textContent).toBe('?')
})

test('a deal draws one steel wedge per card with its label whatever Show labels says, and a frame each', () => {
  const deal = dealCards(
    { viewers: [{ id: 'a', name: 'Ann', slices: 3, weight: 5, film: null, canReshuffle: false, canBacklog: false }], wildcardCount: 3, today: new Date(2026, 2, 15), commonGround: false },
    seeded(4),
  )
  expect(deal).toHaveLength(8)
  for (const showLabels of [true, false]) {
    const { container, unmount } = render(
      <Wheel wedges={buildCardWedges(deal)} showLabels={showLabels} groupRef={null} />,
    )
    const cards = screen.getAllByTestId('wedge')
    expect(cards).toHaveLength(8)
    for (const wedge of cards) expect(wedge.getAttribute('data-kind')).toBe('card')
    expect(screen.getAllByTestId('frame')).toHaveLength(8)
    expect(screen.getAllByTestId('label-tag').length).toBeGreaterThan(0)
    expect(container.querySelector('svg.wheel > g')?.querySelector('[data-testid="wedge"]')).not.toBeNull()
    unmount()
  }
})
