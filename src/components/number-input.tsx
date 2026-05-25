"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Number input that doesn't fight the user while typing.
 *
 * The trap with naive `<input type="number" value={n} onChange={parseFloat}>`
 * is that the parent re-renders with the new number on every keystroke,
 * which can rewrite the input's value mid-edit (e.g. "12" displayed as
 * "12.00" or a backspaced "" snapped back to "0"). The user experiences
 * this as "auto-backspace" or "won't let me clear the zero."
 *
 * This component keeps an internal string buffer so the user can type
 * freely (including transient empty / partial states), only syncs the
 * external value into the buffer when the input is NOT focused, and
 * reformats on blur. Parent gets `onChange(number)` for every valid
 * partial — so live recompute (e.g. assembly properties driving cost
 * lines) still works in real time.
 */
export default function NumberInput({
  value,
  onChange,
  decimals = false,
  className = "",
  placeholder,
  ariaLabel,
  step,
  min,
}: {
  value: number;
  onChange: (v: number) => void;
  /** When true, blur formats to fixed 2 decimals. Default: integer-ish. */
  decimals?: boolean;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
  step?: number | string;
  min?: number;
}) {
  const [raw, setRaw] = useState<string>(formatVal(value, decimals));
  const focusedRef = useRef(false);

  // Only mirror external value into the buffer when the input isn't
  // being edited. Otherwise the parent's recompute would overwrite the
  // user's in-flight keystrokes.
  useEffect(() => {
    if (!focusedRef.current) {
      setRaw(formatVal(value, decimals));
    }
  }, [value, decimals]);

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={raw}
      placeholder={placeholder}
      aria-label={ariaLabel}
      step={step}
      min={min}
      onFocus={(e) => {
        focusedRef.current = true;
        // Select-all on focus so the next keystroke replaces — matches
        // how most spreadsheet-style number cells behave.
        e.currentTarget.select();
      }}
      onChange={(e) => {
        const v = e.target.value;
        setRaw(v);
        // Allow empty / trailing-decimal states ("", "3.") while typing;
        // only push a valid finite number up to the parent.
        if (v === "" || v === "-" || v.endsWith(".")) return;
        const n = parseFloat(v);
        if (Number.isFinite(n)) onChange(n);
      }}
      onBlur={() => {
        focusedRef.current = false;
        // Treat an empty input as 0 on blur (committing the cleared state).
        const n = parseFloat(raw);
        if (!Number.isFinite(n)) {
          onChange(0);
          setRaw(formatVal(0, decimals));
        } else {
          setRaw(formatVal(n, decimals));
        }
      }}
      className={className}
    />
  );
}

function formatVal(v: number, decimals: boolean): string {
  if (!Number.isFinite(v)) return "0";
  // Currency mode: always 2 decimals (e.g. cost / markup% / price).
  if (decimals) return v.toFixed(2);
  // Quantity mode: whole numbers render without ".00"; fractional ones
  // get up to 2 decimals with trailing zeros stripped (169 stays "169",
  // 169.5 stays "169.5", 169.456 rounds to "169.46").
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(2).replace(/\.?0+$/, "");
}

/** Standalone formatter — useful when displaying a quantity in a read-only
 *  cell (e.g. computed assembly material lines). Same rules as the input's
 *  blur formatter. */
export function fmtQty(n: number): string {
  return formatVal(n, false);
}
