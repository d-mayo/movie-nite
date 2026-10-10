import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import App from '../App.tsx'
import { defaultState, type Nomination } from '../state/model.ts'
import { createMemoryPersistence } from '../state/persistence.ts'
import { createAppStore } from '../state/store.ts'
import { presetColors } from '../wheel/colors.ts'
import { markAway, markHere, removeViewer } from '../test/cells.ts'
import { defaultWheelSettings } from '../wheel/edit.ts'

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
    createMemoryPersistence({ ...defaultState, settings: { tmdbToken: 'tok', viewersHidden: false, wheel: defaultWheelSettings } }),
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
  fireEvent.change(screen.getByLabelText('Add a viewer'), { target: { value: 'Ann' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add' }))
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

test('a viewer name of 20 characters is shortened on the wheel, a short one is not', () => {
  setup()
  for (const name of ['abcdefghijklmnopqrst', 'Ann']) {
    fireEvent.change(screen.getByLabelText('Add a viewer'), { target: { value: name } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
  }
  expect(screen.getAllByText('abcdefghijklm…')).not.toHaveLength(0)
  expect(screen.queryByText('abcdefghijklmnopqrst', { selector: 'text' })).toBeNull()
  expect(screen.getAllByText('Ann', { selector: 'text' })).not.toHaveLength(0)
})

function addViewers(names: string[]) {
  for (const name of names) {
    fireEvent.change(screen.getByLabelText('Add a viewer'), { target: { value: name } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
  }
}

test('every label is white on a 42% black scrim, on a light color and a dark one', () => {
  const store = setup()
  addViewers(['Ann', 'Bo'])
  const [ann, bo] = store.getState().roster
  act(() => store.getState().setViewerColor(ann.id, '#ffe119'))
  act(() => store.getState().setViewerColor(bo.id, presetColors[7]))
  act(() => store.getState().nominate(ann.id, film(1, null)))
  const scrims = screen.getAllByTestId('scrim')
  expect(scrims.length).toBeGreaterThan(0)
  for (const rect of scrims) {
    expect(rect.getAttribute('fill')).toBe('#000000')
    expect(rect.getAttribute('opacity')).toBe('0.42')
    for (const t of Array.from(rect.parentElement!.querySelectorAll('text')))
      expect(t.getAttribute('fill')).toBe('#ffffff')
  }
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
  expect(fills.filter((f) => f === '#5a5a54')).toHaveLength(frames.length - 6)
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
  // Ann's three slices share one gradient; the radial ones are two viewers, the wildcard and the gloss.
  const annIds = new Set(wedges().filter((w) => fillId(w) === fillId(annWedge)))
  expect(annIds.size).toBe(3)
  expect(others.length).toBeGreaterThan(0)
  expect(document.querySelectorAll('svg.wheel radialGradient')).toHaveLength(4)
  const wild = wedges().find((w) => w.getAttribute('data-kind') === 'wildcard')!
  expect(document.getElementById(fillId(wild))).not.toBeNull()
  expect(fillId(wild)).not.toBe(fillId(annWedge))
  expect(annWedge.querySelectorAll('[data-testid="poster-fade"]')).toHaveLength(1)
})

test('the pointer hangs above the strip with its tip over the frames', () => {
  setup()
  addViewers(['Ann'])
  const points = screen.getByTestId('pointer').getAttribute('points')!.split(' ')
  const tipY = Number(points[2].split(',')[1])
  expect(tipY).toBeGreaterThanOrEqual(-111)
  expect(tipY).toBeLessThanOrEqual(-104.6)
})
