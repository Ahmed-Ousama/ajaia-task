"use client";

import { useEffect, useRef, useState } from "react";
import { Ban, type LucideIcon } from "lucide-react";

export type Swatch = { name: string; value: string };

export const TEXT_COLORS: Swatch[] = [
  { name: "Gray", value: "#6b7280" },
  { name: "Red", value: "#dc2626" },
  { name: "Orange", value: "#ea580c" },
  { name: "Amber", value: "#b45309" },
  { name: "Green", value: "#16a34a" },
  { name: "Teal", value: "#0d9488" },
  { name: "Blue", value: "#2563eb" },
  { name: "Purple", value: "#7c3aed" },
  { name: "Pink", value: "#db2777" },
];

export const HIGHLIGHTS: Swatch[] = [
  { name: "Yellow", value: "#fef08a" },
  { name: "Green", value: "#bbf7d0" },
  { name: "Blue", value: "#bfdbfe" },
  { name: "Pink", value: "#fbcfe8" },
  { name: "Orange", value: "#fed7aa" },
  { name: "Purple", value: "#e9d5ff" },
];

/** Toolbar button with a swatch popover (text colour / highlighter). */
export default function ColorMenu({
  icon: Icon,
  title,
  swatches,
  current,
  clearLabel,
  onPick,
  onClear,
}: {
  icon: LucideIcon;
  title: string;
  swatches: Swatch[];
  current: string | null;
  clearLabel: string;
  onPick: (color: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        title={title}
        aria-label={title}
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()} // keep the editor selection
        onClick={() => setOpen((o) => !o)}
        className={`flex h-8 w-9 flex-col items-center justify-center gap-[2px] rounded-md transition-colors ${
          open ? "bg-black/10" : "hover:bg-black/5"
        } text-gray-700`}
      >
        <Icon size={16} />
        <span className="h-[3px] w-4 rounded-full" style={{ background: current ?? "transparent", outline: current ? "none" : "1px solid #d1d5db" }} />
      </button>
      {open && (
        <div className="absolute left-0 z-40 mt-1 w-52 rounded-xl border border-gray-200 bg-white p-3 shadow-lg">
          <p className="mb-2 text-xs font-medium text-gray-500">{title}</p>
          <div className="grid grid-cols-6 gap-1.5">
            {swatches.map((s) => (
              <button
                key={s.value}
                type="button"
                title={s.name}
                aria-label={s.name}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(s.value);
                  setOpen(false);
                }}
                className={`h-6 w-6 rounded-full border transition hover:scale-110 ${
                  current?.toLowerCase() === s.value ? "border-gray-900 ring-2 ring-gray-900/20" : "border-black/10"
                }`}
                style={{ background: s.value }}
              />
            ))}
          </div>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onClear();
              setOpen(false);
            }}
            className="mt-3 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-gray-600 hover:bg-gray-100"
          >
            <Ban size={13} /> {clearLabel}
          </button>
        </div>
      )}
    </div>
  );
}
