"use client";

import { useEffect } from "react";
import { formatDate } from "@/lib/format";
import type { DuplicateInfo } from "@/lib/upload-client";

/** Asks the user whether to store another copy of a file they already uploaded. */
export default function DuplicateFileDialog({
  newFilename,
  duplicate,
  busy,
  onCancel,
  onConfirm,
}: {
  newFilename: string;
  duplicate: DuplicateInfo;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={() => !busy && onCancel()}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dup-title"
        aria-describedby="dup-desc"
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="dup-title" className="text-lg font-semibold text-gray-900">
          You&apos;ve uploaded this file before
        </h2>
        <div id="dup-desc" className="mt-3 space-y-2 text-sm text-gray-600">
          <p>
            <span className="font-medium text-gray-900">{newFilename}</span> has exactly the same content as{" "}
            <span className="font-medium text-gray-900">{duplicate.filename}</span>, which you uploaded{" "}
            {formatDate(duplicate.uploadedAt)} to{" "}
            <a href={`/documents/${duplicate.documentId}`} className="text-blue-700 underline" target="_blank" rel="noreferrer">
              {duplicate.documentTitle}
            </a>
            .
          </p>
          <p>Upload it again anyway? The new copy will get a numbered name, e.g. “report (2).pdf”.</p>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            autoFocus
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {busy ? "Uploading…" : "Upload a copy"}
          </button>
        </div>
      </div>
    </div>
  );
}
