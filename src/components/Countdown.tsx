// The film leader's dial, laid over the wheel's face (and the Spin hub) while a countdown runs:
// opaque film stock inside the reel strip, cream rings and crosshairs, a steel hand that sweeps
// once round during each number, and the number in Bebas Neue. Upright, decorative and out of the
// way of every pointer. The hand's layer is keyed to the number, so each number starts its sweep.
export default function Countdown({ number }: { number: number }) {
  return (
    <div className="countdown" aria-hidden="true" data-testid="countdown">
      <svg viewBox="-100 -100 200 200" className="countdown-dial" focusable="false">
        <circle r="100" className="countdown-stock" />
        <circle r="92" className="countdown-ring" />
        <circle r="62" className="countdown-ring" />
        <circle r="32" className="countdown-ring" />
        <path d="M -100 0 H 100 M 0 -100 V 100" className="countdown-cross" />
        <text className="countdown-number" x="0" y="0" textAnchor="middle" dominantBaseline="central">
          {number}
        </text>
      </svg>
      <div className="countdown-hand" key={number} data-testid="countdown-hand" />
    </div>
  )
}
