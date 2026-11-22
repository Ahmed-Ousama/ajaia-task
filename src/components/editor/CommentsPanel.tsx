"use client";

import { MessageSquare } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, jsonInit } from "@/lib/api-client";
import { useConfirm } from "@/components/ConfirmDialog";
import { useDocEvent } from "./useDocEvents";
import { can, type Access } from "@/lib/access";
import { formatDate } from "@/lib/format";

type CommentDTO = {
  id: string;
  body: string;
  quote: string | null;
  resolvedAt: string | null;
  createdAt: string;
  author: { id: string; name: string };
};

const POLL_MS = 60_000;
const MAX_BODY = 2000;
const MAX_QUOTE = 500;

export default function CommentsPanel({
  documentId,
  currentUserId,
  access,
  getSelectedText,
}: {
  documentId: string;
  currentUserId: string;
  access: Access;
  getSelectedText: () => string;
}) {
  const [confirm, confirmDialog] = useConfirm();
  const [comments, setComments] = useState<CommentDTO[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [body, setBody] = useState("");
  const [quote, setQuote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);

  const load = useCallback(async () => {
    try {
      setComments(await api<CommentDTO[]>(`/api/documents/${documentId}/comments`));
      setLoaded(true);
    } catch {
      /* transient: keep last state, retry on next poll */
    }
  }, [documentId]);

  useEffect(() => {
    void load();
    const timer = setInterval(load, POLL_MS); // fallback if the live stream drops
    return () => clearInterval(timer);
  }, [load]);

  // Live: someone added/resolved/deleted a comment → refresh immediately.
  useDocEvent(documentId, "comments", () => void load());

  function captureSelection() {
    const text = getSelectedText().trim();
    if (text) setQuote(text.slice(0, MAX_QUOTE));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api<CommentDTO>(
        `/api/documents/${documentId}/comments`,
        jsonInit("POST", { body, quote }),
      );
      setComments((prev) => [...prev, created]);
      setBody("");
      setQuote(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function setResolved(c: CommentDTO, resolved: boolean) {
    setError(null);
    try {
      const updated = await api<CommentDTO>(`/api/comments/${c.id}`, jsonInit("PATCH", { resolved }));
      setComments((prev) => prev.map((x) => (x.id === c.id ? updated : x)));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(c: CommentDTO) {
    const ok = await confirm({
      title: "Delete comment?",
      message: "This comment will be removed for everyone.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    setError(null);
    try {
      await api(`/api/comments/${c.id}`, { method: "DELETE" });
      setComments((prev) => prev.filter((x) => x.id !== c.id));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const canResolve = (c: CommentDTO) => can.edit(access) || c.author.id === currentUserId;
  const canDelete = (c: CommentDTO) => access === "owner" || c.author.id === currentUserId;

  const open = comments.filter((c) => !c.resolvedAt);
  const resolved = comments.filter((c) => c.resolvedAt);

  function renderComment(c: CommentDTO) {
    const isResolved = Boolean(c.resolvedAt);
    return (
      <li key={c.id} className={`rounded-md border border-gray-100 p-2 ${isResolved ? "bg-gray-50 opacity-80" : "bg-white"}`}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-medium text-gray-900">{c.author.name}</span>
          <span className="shrink-0 text-xs text-gray-500">{formatDate(c.createdAt)}</span>
        </div>
        {c.quote && (
          <blockquote className="mt-1 line-clamp-3 border-l-2 border-gray-300 pl-2 text-xs italic text-gray-500">
            {c.quote}
          </blockquote>
        )}
        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-700">{c.body}</p>
        {(canResolve(c) || canDelete(c)) && (
          <div className="mt-1.5 flex gap-3 text-xs">
            {canResolve(c) && (
              <button onClick={() => setResolved(c, !isResolved)} className="font-medium text-blue-700 hover:underline">
                {isResolved ? "Reopen" : "Resolve"}
              </button>
            )}
            {canDelete(c) && (
              <button onClick={() => remove(c)} className="text-gray-500 hover:text-red-700">
                Delete
              </button>
            )}
          </div>
        )}
      </li>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      {confirmDialog}
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
        <MessageSquare size={16} className="text-gray-500" /> Comments <span className="font-normal text-gray-400">({open.length} open)</span>
      </h2>

      <form onSubmit={submit} className="space-y-2">
        {quote && (
          <div className="flex items-start gap-2 rounded-md bg-gray-50 p-2">
            <blockquote className="line-clamp-3 flex-1 border-l-2 border-blue-300 pl-2 text-xs italic text-gray-600">
              {quote}
            </blockquote>
            <button
              type="button"
              onClick={() => setQuote(null)}
              className="text-xs text-gray-400 hover:text-gray-700"
              aria-label="Remove quoted text"
            >
              ✕
            </button>
          </div>
        )}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onFocus={() => !quote && captureSelection()}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") void submit(e);
          }}
          maxLength={MAX_BODY}
          rows={2}
          placeholder="Add a comment…"
          aria-label="New comment"
          className="w-full resize-y rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        />
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()} // keep the editor selection
            onClick={captureSelection}
            className="text-xs text-gray-500 hover:text-gray-800"
            title="Select text in the document, then click to quote it"
          >
            Quote selection
          </button>
          <button
            type="submit"
            disabled={busy || !body.trim()}
            className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "Posting…" : "Comment"}
          </button>
        </div>
      </form>

      {error && (
        <p className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700" role="alert">
          {error}
        </p>
      )}

      <div className="mt-3">
        {!loaded ? (
          <p className="text-xs text-gray-400">Loading comments…</p>
        ) : open.length === 0 ? (
          <p className="text-xs text-gray-500">No open comments.</p>
        ) : (
          <ul className="max-h-[50vh] space-y-2 overflow-y-auto">{open.map(renderComment)}</ul>
        )}

        {resolved.length > 0 && (
          <div className="mt-3 border-t border-gray-100 pt-2">
            <button onClick={() => setShowResolved((s) => !s)} className="text-xs text-gray-500 hover:text-gray-800">
              {showResolved ? "Hide" : "Show"} resolved ({resolved.length})
            </button>
            {showResolved && <ul className="mt-2 space-y-2">{resolved.map(renderComment)}</ul>}
          </div>
        )}
      </div>
    </div>
  );
}
