"use client";

import { ReactNode, useEffect, useId, useRef, useState } from "react";

interface TooltipProps {
  label: ReactNode;
  children: ReactNode;
  placement?: "top" | "bottom" | "right" | "left";
  variant?: "info" | "directive";
  delay?: number;
  className?: string;
}

export default function Tooltip({
  label,
  children,
  placement = "top",
  variant = "info",
  delay = 150,
  className = "",
}: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
  };

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const placementClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
  }[placement];

  const bgClass =
    variant === "directive"
      ? "bg-sky-900 ring-sky-700"
      : "bg-slate-900 ring-slate-800";

  return (
    <span
      className={`relative inline-flex ${className}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <span aria-describedby={open ? id : undefined} className="contents">
        {children}
      </span>
      {open && (
        <span
          role="tooltip"
          id={id}
          className={`pointer-events-none absolute z-50 w-max max-w-xs whitespace-normal rounded-md px-2.5 py-1.5 text-xs font-medium leading-relaxed text-white shadow-lg ring-1 ${bgClass} ${placementClasses}`}
        >
          {label}
        </span>
      )}
    </span>
  );
}
