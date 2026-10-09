import { useId, type KeyboardEvent } from 'react'

const TICKS = 12

interface StepperProps {
  label: string
  value: number
  min: number
  // At most 12: the tick bar always has 12 ticks, those above max dimmed.
  max: number
  onChange: (n: number) => void
}

// A whole-number count: − and + buttons around the value, over a bar of 12 ticks.
// The ticks are pointer shortcuts only; the buttons and keys cover every value.
export default function Stepper({ label, value, min, max, onChange }: StepperProps) {
  const labelId = useId()
  const set = (n: number) => {
    const next = Math.min(max, Math.max(min, n))
    if (next !== value) onChange(next)
  }
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const target: Record<string, number> = {
      ArrowUp: value + 1,
      ArrowRight: value + 1,
      ArrowDown: value - 1,
      ArrowLeft: value - 1,
      Home: min,
      End: max,
    }
    if (!(e.key in target)) return
    e.preventDefault()
    set(target[e.key])
  }
  return (
    <div className="stepper" role="group" aria-labelledby={labelId} onKeyDown={onKeyDown}>
      <div className="stepper-row">
        <span id={labelId} className="stepper-label">
          {label}
        </span>
        <button
          type="button"
          className="quiet stepper-button"
          aria-label={`Decrease ${label}`}
          aria-disabled={value <= min}
          onClick={() => set(value - 1)}
        >
          <span aria-hidden="true">−</span>
        </button>
        <output className="stepper-value">{value}</output>
        <button
          type="button"
          className="quiet stepper-button"
          aria-label={`Increase ${label}`}
          aria-disabled={value >= max}
          onClick={() => set(value + 1)}
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>
      <div className="stepper-ticks" aria-hidden="true">
        {Array.from({ length: TICKS }, (_, i) => i + 1).map((v) => (
          <span
            key={v}
            className="stepper-tick"
            data-filled={v <= value}
            data-available={v >= min && v <= max}
            onClick={() => v >= min && v <= max && set(v)}
          />
        ))}
      </div>
    </div>
  )
}
