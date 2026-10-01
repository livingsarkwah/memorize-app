import { useId } from 'react';
import type { ReactNode } from 'react';

export interface Choice<T> {
  value: T;
  label: string;
  disabled?: boolean;
}

/** A row of mutually exclusive buttons ("segmented control"). */
export function Segmented<T extends string | number>({ label, choices, value, onChange }: {
  label: string; choices: readonly Choice<T>[]; value: T; onChange: (value: T) => void;
}) {
  return (
    <div className="pick" role="group" aria-label={label}>
      {choices.map((c) => (
        <button key={String(c.value)} type="button" className="pick-btn" aria-pressed={c.value === value} disabled={c.disabled} onClick={() => onChange(c.value)}>
          {c.label}
        </button>
      ))}
    </div>
  );
}

export function SwitchRow({ label, hint, checked, disabled, onChange }: {
  label: string; hint?: ReactNode; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="row-switch">
      <div>
        <div className="lbl" id={id}>{label}</div>
        {hint && <div className="hint">{hint}</div>}
      </div>
      <button type="button" className="switch" role="switch" aria-checked={checked} aria-labelledby={id} disabled={disabled} onClick={() => onChange(!checked)}>
        <span className="knob" />
      </button>
    </div>
  );
}

/** − 3 + with limits. `forever` shows ∞ and disables both buttons. */
export function Stepper({ value, min = 1, max = 99, forever = false, decreaseLabel, increaseLabel, onChange }: {
  value: number; min?: number; max?: number; forever?: boolean; decreaseLabel: string; increaseLabel: string; onChange: (value: number) => void;
}) {
  return (
    <div className="stepper">
      <button type="button" aria-label={decreaseLabel} disabled={forever || value <= min} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <output aria-live="polite">{forever ? '∞' : value}</output>
      <button type="button" aria-label={increaseLabel} disabled={forever || value >= max} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
    </div>
  );
}
