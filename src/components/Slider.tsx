import { useId, type CSSProperties } from 'react'

interface SliderProps {
  label: string
  value: number
  step: number
  min: number
  max: number
  onChange: (n: number) => void
  // How the value is shown and announced; the plain number by default.
  format?: (n: number) => string
}

// A range slider that applies every change at once: the label and its value on
// one row, the full-width track under them, filled up to the thumb.
export default function Slider({ label, value, step, min, max, onChange, format }: SliderProps) {
  const id = useId()
  const shown = format ? format(value) : String(value)
  const fill = max > min ? ((value - min) / (max - min)) * 100 : 0
  return (
    <span className="slider">
      <span className="slider-row">
        <label htmlFor={id} className="slider-label">
          {label}
        </label>
        <output htmlFor={id}>{shown}</output>
      </span>
      <input
        id={id}
        type="range"
        step={step}
        min={min}
        max={max}
        value={value}
        aria-valuetext={format ? shown : undefined}
        style={{ '--fill': `${fill}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </span>
  )
}
