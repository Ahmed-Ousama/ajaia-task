"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, RotateCcw, type LucideIcon } from "lucide-react";

export type ConfirmOptions = {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  icon?: LucideIcon;
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

/**
 * Promise-based replacement for window.confirm():
 *   const [confirm, confirmDialog] = useConfirm();
 *   if (!(await confirm({ title: "Delete?" }))) return;
 *   ...render {confirmDialog} somewhere in the component.
 */
export function useConfirm() {
  const [pending, setPending] = useState<Pending | null>(null);
  const confirm = useCallback(
    (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...opts, resolve })),
    [],
  );
  const close = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };
  const dialog = pending ? <ConfirmDialog {...pending} onCancel={() => close(false)} onConfirm={() => close(true)} /> : null;
  return [confirm, dialog] as const;
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "primary",
  icon,
  onCancel,
  onConfirm,
}: ConfirmOptions & { onCancel: () => void; onConfirm: () => void }) {
  const confirmBtn = useRef<HTMLButtonElement>(null);
  const Icon = icon ?? (tone === "danger" ? AlertTriangle : RotateCcw);

  useEffect(() => {
    confirmBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-gray-900/40 p-4 backdrop-blur-[2px]" onClick={onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex gap-4">
          <span
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
              tone === "danger" ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"
            }`}
            aria-hidden
          >
            <Icon size={20} />
          </span>
          <div className="min-w-0 pt-1">
            <h2 id="confirm-title" className="text-base font-semibold text-gray-900">
              {title}
            </h2>
            {message && <div className="mt-1.5 text-sm leading-relaxed text-gray-600">{message}</div>}
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtn}
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              tone === "danger"
                ? "bg-red-600 hover:bg-red-700 focus:ring-red-500"
                : "bg-blue-600 hover:bg-blue-700 focus:ring-blue-500"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
