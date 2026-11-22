"use client";

import { useEffect, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { api } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { editorExtensions } from "./extensions";
import { useConfirm } from "@/components/ConfirmDialog";

type VersionSummary = { id: string; title: string; createdAt: string; author: { name: string } };
type VersionDetail = VersionSummary & { content: string };

export default function VersionHistory({
  documentId,
  canRestore,
  onClose,
  onRestored,
}: {
  documentId: string;
  canRestore: boolean;
  onClose: () => void;
  onRestored: (doc: { title: string; content: string; updatedAt: string }) => void;
}) {
  const [versions, setVersions] = useState<VersionSummary[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<VersionDetail | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  // Read-only preview: rendered through the same schema as the editor (never raw innerHTML).
  const preview = useEditor({
    extensions: editorExtensions(),
    editable: false,
    immediatelyRender: false,
    content: "",
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !restoring && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, restoring]);

  useEffect(() => {
    let cancelled = false;
    api<VersionSummary[]>(`/api/documents/${documentId}/versions`)
      .then((list) => {
        if (cancelled) return;
        setVersions(list);
        if (list[0]) setSelectedId(list[0].id);
      })
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setPreviewLoading(true);
    setError(null);
    api<VersionDetail>(`/api/documents/${documentId}/versions/${selectedId}`)
      .then((v) => !cancelled && setSelected(v))
      .catch((e) => !cancelled && setError((e as Error).message))
      .finally(() => !cancelled && setPreviewLoading(false));
    return () => {
      cancelled = true;
    };
  }, [documentId, selectedId]);

  useEffect(() => {
    if (preview && selected) preview.commands.setContent(selected.content || "", false);
  }, [preview, selected]);

  const currentId = versions?.[0]?.id;
  const isCurrent = selected?.id === currentId;

  async function restore() {
    if (!selected) return;
    const ok = await confirm({
      title: "Restore this version?",
      message: (
        <>
          The document will go back to the version from <strong>{formatDate(selected.createdAt)}</strong> by{" "}
          {selected.author.name}. Nothing is lost — the current content stays in the history.
        </>
      ),
      confirmLabel: "Restore",
    });
    if (!ok) return;
    setRestoring(true);
    setError(null);
    try {
      const doc = await api<{ title: string; content: string; updatedAt: string }>(
        `/api/documents/${documentId}/versions/${selected.id}/restore`,
        { method: "POST" },
      );
      onRestored(doc);
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setRestoring(false);
    }
  }

  return (
    <>
    {confirmDialog}
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => !restoring && onClose()}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-title"
        className="flex h-full w-[28rem] max-w-full flex-col bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 id="history-title" className="text-base font-semibold text-gray-900">
            Version history
          </h2>
          <button onClick={onClose} className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label="Close version history">
            ✕
          </button>
        </header>

        {error && (
          <p className="mx-5 mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        <div className="max-h-[38%] shrink-0 overflow-y-auto border-b border-gray-200">
          {versions === null ? (
            <p className="px-5 py-4 text-sm text-gray-500">Loading…</p>
          ) : versions.length === 0 ? (
            <p className="px-5 py-4 text-sm text-gray-500">No versions yet — they are saved automatically as you edit.</p>
          ) : (
            <ul className="py-1">
              {versions.map((v) => (
                <li key={v.id}>
                  <button
                    onClick={() => setSelectedId(v.id)}
                    className={`flex w-full flex-col items-start px-5 py-2 text-left hover:bg-gray-50 ${
                      v.id === selectedId ? "bg-blue-50" : ""
                    }`}
                    aria-current={v.id === selectedId}
                  >
                    <span className="flex w-full items-center gap-2 text-sm font-medium text-gray-900">
                      {formatDate(v.createdAt)}
                      {v.id === currentId && (
                        <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">Current</span>
                      )}
                    </span>
                    <span className="w-full truncate text-xs text-gray-500">
                      {v.author.name} · {v.title}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {selected && (
            <p className="mb-3 text-xs uppercase tracking-wide text-gray-400">
              Preview · {selected.title}
              {previewLoading && " · loading…"}
            </p>
          )}
          <div className={`doc-content text-sm ${previewLoading ? "opacity-50" : ""}`}>
            {preview && <EditorContent editor={preview} />}
          </div>
        </div>

        {canRestore && selected && !isCurrent && (
          <footer className="border-t border-gray-200 px-5 py-3">
            <button
              onClick={restore}
              disabled={restoring || previewLoading}
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {restoring ? "Restoring…" : "Restore this version"}
            </button>
          </footer>
        )}
      </aside>
    </div>
    </>
  );
}
