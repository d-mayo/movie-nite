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
import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { viewersOnWheel } from '../state/model.ts'
import { useApp } from '../state/store.ts'
import { materialiseDefault, type SliceRef } from '../wheel/edit.ts'
import Slider from './Slider.tsx'

interface Props {
  locked?: boolean
  onClosed: () => void
  // The button the popover hangs from.
  anchor?: RefObject<HTMLElement | null>
}

function SortableSlice({
  id,
  index,
  locked,
  children,
}: {
  id: string
  index: number
  locked: boolean
  children: ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: locked,
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
        className="drag-handle quiet"
        aria-label={`Drag slice ${index + 1}`}
        disabled={locked}
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      {children}
    </li>
  )
}

// The Wheel settings popover. Mounted only while shown, like the End night
// dialog: Done and a backdrop click unmount it directly, and Escape does so
// through the native `close` event.
export default function WheelEditor({ locked = false, onClosed, anchor }: Props) {
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
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  // True when the press that began a click landed on the backdrop, not in the drawer.
  const pressedBackdrop = useRef(false)
  useEffect(() => {
    const el = dialog.current
    if (!el) return
    if (!el.open) el.showModal()
    el.addEventListener('close', onClosed)
    // Keep focus off the sliders, so an arrow key right after opening changes nothing.
    heading.current?.focus()
    // Hang the popover under the button that opened it, right edges aligned.
    function place() {
      const rect = anchor?.current?.getBoundingClientRect()
      if (!el || !rect) return
      el.style.top = `${rect.bottom + 8}px`
      const left = rect.right - el.offsetWidth
      el.style.left = `${Math.min(Math.max(8, left), window.innerWidth - el.offsetWidth - 8)}px`
      el.style.maxHeight = `${window.innerHeight - rect.bottom - 24}px`
    }
    place()
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('resize', place)
      el.removeEventListener('close', onClosed)
    }
  }, [anchor, onClosed])
  // Close natively, then unmount at once rather than wait for the `close` event.
  function dismiss() {
    dialog.current?.close()
    onClosed()
  }
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
    <dialog
      ref={dialog}
      className="card wheel-drawer"
      aria-labelledby="wheel-settings-heading"
      onPointerDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressedBackdrop.current) dismiss()
      }}
    >
      <div className="drawer-body">
        <h2 id="wheel-settings-heading" tabIndex={-1} ref={heading}>
          Wheel settings
        </h2>
        <fieldset disabled={locked} className="setup wheel-editor">
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
                  className="danger"
                  aria-label={`Remove wildcard ${i + 1}`}
                  onClick={() => removeWildcard(w.id)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={addWildcard} disabled={onWheel.length === 0}>
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
                  <SortableSlice key={ref.id} id={ref.id} index={i} locked={locked}>
                    {sliceLabel(ref)}
                    <button
                      type="button"
                      className="quiet"
                      aria-label={`Move slice ${i + 1} up`}
                      disabled={i === 0}
                      onClick={() => moveSlice(i, i - 1)}
                    >
                      Move up
                    </button>
                    <button
                      type="button"
                      className="quiet"
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
        </fieldset>
        <div className="drawer-footer">
          <button type="button" className="primary" onClick={dismiss}>
            Done
          </button>
        </div>
      </div>
    </dialog>
  )
}
