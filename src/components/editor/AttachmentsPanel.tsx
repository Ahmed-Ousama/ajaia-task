"use client";

import { Paperclip } from "lucide-react";
import { useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { uploadFile, type DuplicateInfo } from "@/lib/upload-client";
import DuplicateFileDialog from "@/components/DuplicateFileDialog";
import { useConfirm } from "@/components/ConfirmDialog";
import { ATTACHMENT_EXTENSIONS, MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL, isAttachable } from "@/lib/files";
import { formatBytes, formatDate } from "@/lib/format";
import type { AttachmentDTO } from "./types";

export default function AttachmentsPanel({
  documentId,
  canManage,
  initial,
}: {
  documentId: string;
  canManage: boolean;
  initial: AttachmentDTO[];
}) {
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const [pending, setPending] = useState<{ file: File; duplicate: DuplicateInfo } | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  async function send(file: File, allowDuplicate = false) {
    setBusy(true);
    setError(null);
    try {
      const res = await uploadFile<AttachmentDTO>(`/api/documents/${documentId}/attachments`, file, allowDuplicate);
      if (!res.ok) {
        setPending({ file, duplicate: res.duplicate }); // same bytes uploaded before → confirm first
        return;
      }
      setPending(null);
      setItems((prev) => [res.data, ...prev]);
    } catch (e) {
      setPending(null);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function upload(file: File | undefined) {
    if (input.current) input.current.value = "";
    if (!file) return;
    setError(null);
    if (!isAttachable(file.name)) return setError("That file type isn't supported.");
    if (file.size > MAX_UPLOAD_BYTES) return setError(`File is too large (max ${MAX_UPLOAD_LABEL}).`);
    void send(file);
  }

  async function remove(a: AttachmentDTO) {
    const ok = await confirm({
      title: "Remove attachment?",
      message: (
        <>
          <strong>{a.filename}</strong> will be deleted for everyone with access to this document.
        </>
      ),
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (!ok) return;
    setError(null);
    try {
      await api(`/api/attachments/${a.id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((x) => x.id !== a.id));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Paperclip size={16} className="text-gray-500" /> Attachments <span className="font-normal text-gray-400">({items.length})</span>
        </h2>
        {canManage && (
          <button
            onClick={() => input.current?.click()}
            disabled={busy}
            className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            {busy ? "Uploading…" : "Upload"}
          </button>
        )}
        <input
          ref={input}
          type="file"
          className="hidden"
          accept={ATTACHMENT_EXTENSIONS.join(",")}
          onChange={(e) => upload(e.target.files?.[0])}
        />
      </div>

      {error && (
        <p className="mb-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700" role="alert">
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <p className="text-xs text-gray-500">No files attached yet.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((a) => (
            <li key={a.id} className="group flex items-start gap-2 rounded-md p-1 hover:bg-gray-50">
              <span className="mt-0.5 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gray-600">
                {a.filename.split(".").pop()}
              </span>
              <div className="min-w-0 flex-1">
                <a
                  href={`/api/attachments/${a.id}`}
                  className="block truncate text-sm text-blue-700 hover:underline"
                  title={`Download ${a.filename}`}
                >
                  {a.filename}
                </a>
                <div className="text-xs text-gray-500">
                  {formatBytes(a.size)} · {a.uploadedBy.name} · {formatDate(a.createdAt)}
                </div>
              </div>
              {canManage && (
                <button
                  onClick={() => remove(a)}
                  className="rounded px-1 text-xs text-gray-400 hover:text-red-700"
                  aria-label={`Remove ${a.filename}`}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {confirmDialog}
      {pending && (
        <DuplicateFileDialog
          newFilename={pending.file.name}
          duplicate={pending.duplicate}
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={() => send(pending.file, true)}
        />
      )}

      <p className="mt-3 border-t border-gray-100 pt-2 text-[11px] leading-snug text-gray-400">
        {ATTACHMENT_EXTENSIONS.join(" ")} · max {MAX_UPLOAD_LABEL}. Stored privately; only people with access to this document
        can download.
      </p>
    </div>
  );
}
