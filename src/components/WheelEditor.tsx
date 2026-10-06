import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ReactNode } from 'react'
import { viewersOnWheel } from '../state/model.ts'
import { useApp } from '../state/store.ts'
import { materialiseDefault, type SliceRef } from '../wheel/edit.ts'

interface Props {
  locked?: boolean
  onDone: () => void
}

interface SliderProps {
  label: string
  value: number
  step: number
  min: number
  max: number
  onChange: (n: number) => void
}

// A range slider that applies every change at once, with its value shown beside it.
function Slider({ label, value, step, min, max, onChange }: SliderProps) {
  return (
    <span className="slider">
      <label>
        {label}
        <input
          type="range"
          step={step}
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </label>
      <output>{value}</output>
    </span>
  )
}

function SortableSlice({
  id,
  index,
  children,
}: {
  id: string
  index: number
  children: ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  })
  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
    >
      <button
        type="button"
        className="drag-handle"
        aria-label={`Drag slice ${index + 1}`}
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      {children}
    </li>
  )
}

export default function WheelEditor({ locked = false, onDone }: Props) {
  const {
    roster,
    night,
    setViewerWeight,
    setViewerSlices,
    setWildcardWeight,
    addWildcard,
    removeWildcard,
    moveSlice,
    spreadEvenly,
    resetLayout,
  } = useApp()
  const onWheel = viewersOnWheel(night)
  const layout = night.layout ?? materialiseDefault(onWheel)
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const nameOf = (id: string) => roster.find((v) => v.id === id)?.name ?? ''

  function dragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const ids = layout.order.map((r) => r.id)
    moveSlice(ids.indexOf(String(active.id)), ids.indexOf(String(over.id)))
  }

  function sliceLabel(ref: SliceRef): string {
    if (ref.kind === 'wildcard') return 'Wildcard'
    const film = night.nominations[ref.viewerId]
    return `${nameOf(ref.viewerId)}: ${film ? film.title : 'no film yet'}`
  }

  return (
    <section>
      <fieldset disabled={locked} className="setup wheel-editor">
        <h2>Edit wheel</h2>
        <h3>Viewers</h3>
        {onWheel.length === 0 && <p>Nobody is on the wheel.</p>}
        <ul>
          {onWheel.map((id) => {
            const setting = layout.viewers[id]
            return (
              <li key={id}>
                <strong>{nameOf(id)}</strong>
                <Slider
                  label={`Weight for ${nameOf(id)}`}
                  value={setting.weight}
                  step={0.5}
                  min={0.5}
                  max={20}
                  onChange={(n) => setViewerWeight(id, n)}
                />
                <Slider
                  label={`Slices for ${nameOf(id)}`}
                  value={setting.slices}
                  step={1}
                  min={1}
                  max={12}
                  onChange={(n) => setViewerSlices(id, n)}
                />
              </li>
            )
          })}
        </ul>
        <h3>Wildcards</h3>
        <Slider
          label="Wildcard weight"
          value={layout.wildcardWeight}
          step={0.5}
          min={0.5}
          max={20}
          onChange={setWildcardWeight}
        />
        <ul>
          {layout.wildcards.map((w, i) => (
            <li key={w.id}>
              Wildcard {i + 1}
              <button
                type="button"
                aria-label={`Remove wildcard ${i + 1}`}
                onClick={() => removeWildcard(w.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={addWildcard}>
          Add wildcard
        </button>
        <h3>Slices</h3>
        {layout.handPlaced && (
          <p>
            Slices are placed by hand. The wheel no longer spreads itself evenly.{' '}
            <button type="button" onClick={spreadEvenly}>
              Spread evenly
            </button>
          </p>
        )}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}>
          <SortableContext
            items={layout.order.map((r) => r.id)}
            strategy={verticalListSortingStrategy}
          >
            <ol>
              {layout.order.map((ref, i) => (
                <SortableSlice key={ref.id} id={ref.id} index={i}>
                  {sliceLabel(ref)}
                  <button
                    type="button"
                    aria-label={`Move slice ${i + 1} up`}
                    disabled={i === 0}
                    onClick={() => moveSlice(i, i - 1)}
                  >
                    Move up
                  </button>
                  <button
                    type="button"
                    aria-label={`Move slice ${i + 1} down`}
                    disabled={i === layout.order.length - 1}
                    onClick={() => moveSlice(i, i + 1)}
                  >
                    Move down
                  </button>
                </SortableSlice>
              ))}
            </ol>
          </SortableContext>
        </DndContext>
        <button type="button" onClick={resetLayout}>
          Reset to default
        </button>
        <button type="button" onClick={onDone}>
          Done
        </button>
      </fieldset>
    </section>
  )
}
