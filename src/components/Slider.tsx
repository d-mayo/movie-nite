interface SliderProps {
  label: string
  value: number
  step: number
  min: number
  max: number
  onChange: (n: number) => void
}

// A range slider that applies every change at once, with its value shown beside it.
export default function Slider({ label, value, step, min, max, onChange }: SliderProps) {
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
