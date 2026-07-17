import type { CSSProperties } from 'react';

export function fillPct(value: number, min: number, max: number): number {
  return Math.round(((value - min) / (max - min)) * 100);
}

export function RangeInput({
  value,
  min,
  max,
  step,
  ariaLabel,
  onValue,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  ariaLabel: string;
  onValue: (v: number) => void;
}) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      aria-label={ariaLabel}
      style={{ '--fill': `${fillPct(value, min, max)}%` } as CSSProperties}
      onChange={(e) => onValue(Number(e.currentTarget.value))}
    />
  );
}

export function ToggleRow({
  label,
  note,
  on,
  onToggle,
}: {
  label: string;
  note: string;
  on: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <div className="setrow">
      <span className="setlbl">
        {label}
        {note ? <small>{note}</small> : null}
      </span>
      <label className="toggle">
        <input
          type="checkbox"
          checked={on}
          aria-label={label}
          onChange={(e) => onToggle(e.currentTarget.checked)}
        />
        <i className="tgl"></i>
        <em className="tglval"></em>
      </label>
    </div>
  );
}
