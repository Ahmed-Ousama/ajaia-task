"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Cloud,
  CloudCheck,
  CloudOff,
  Download,
  Eye,
  FileCode,
  FileDown,
  FileType,
  History as HistoryIcon,
  Loader2,
  Lock,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";
import NotificationBell from "@/components/NotificationBell";
import { LogoMark } from "@/components/Logo";
import { useConfirm } from "@/components/ConfirmDialog";
import UserMenu, { initials } from "@/components/UserMenu";
import { useRouter } from "next/navigation";
import { EditorContent, useEditor } from "@tiptap/react";
import { editorExtensions } from "./extensions";
import { api, jsonInit } from "@/lib/api-client";
import { can } from "@/lib/access";
import { MAX_TITLE_LENGTH } from "@/lib/validation-limits";
import Toolbar from "./Toolbar";
import ShareDialog from "./ShareDialog";
import AttachmentsPanel from "./AttachmentsPanel";
import CommentsPanel from "./CommentsPanel";
import VersionHistory from "./VersionHistory";
import { usePresence } from "./usePresence";
import { useDocEvent } from "./useDocEvents";
import { downloadMarkdown, printToPdf } from "./export";
import type { AttachmentDTO, DocumentDTO, ShareDTO } from "./types";

type SaveState = "saved" | "unsaved" | "saving" | "error";
type Patch = { title?: string; content?: string };

const SAVE_DEBOUNCE_MS = 800;

export default function DocumentEditor({
  doc,
  currentUser,
  initialShares,
  initialAttachments,
}: {
  doc: DocumentDTO;
  currentUser: { id: string; name: string; email: string };
  initialShares: ShareDTO[];
  initialAttachments: AttachmentDTO[];
}) {
  const router = useRouter();
  const currentUserId = currentUser.id;
  const editable = can.edit(doc.access);
  const isOwner = doc.access === "owner";

  const [title, setTitle] = useState(doc.title);
  const savedTitle = useRef(doc.title);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareCount, setShareCount] = useState(initialShares.length);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  /** Someone else saved a newer version while this tab is open. */
  const [remoteEditor, setRemoteEditor] = useState<string | null>(null);
  const lastKnownUpdatedAt = useRef(Date.parse(doc.updatedAt));
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  // ---- Autosave: debounce edits, coalesce title/content into one PATCH, never run two at once.
  const pending = useRef<Patch>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    if (inFlight.current) {
      timer.current = setTimeout(flush, 300);
      return;
    }
    const body = pending.current;
    if (Object.keys(body).length === 0) return;
    pending.current = {};
    inFlight.current = true;
    setSaveState("saving");
    try {
      const res = await api<{ updatedAt: string }>(`/api/documents/${doc.id}`, jsonInit("PATCH", body));
      lastKnownUpdatedAt.current = Math.max(lastKnownUpdatedAt.current, Date.parse(res.updatedAt));
      if (body.title) savedTitle.current = body.title;
      setSaveError(null);
      setSaveState(Object.keys(pending.current).length ? "unsaved" : "saved");
    } catch (e) {
      pending.current = { ...body, ...pending.current }; // keep unsaved changes for retry
      setSaveError((e as Error).message);
      setSaveState("error");
    } finally {
      inFlight.current = false;
    }
  }, [doc.id]);

  const queue = useCallback(
    (patch: Patch) => {
      pending.current = { ...pending.current, ...patch };
      setSaveState("unsaved");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
    },
    [flush],
  );

  const editor = useEditor({
    extensions: editorExtensions(editable ? "Start writing…" : ""),
    content: doc.content || "",
    editable,
    immediatelyRender: false,
    editorProps: { attributes: { class: "focus:outline-none", spellcheck: "true" } },
    onUpdate: ({ editor }) => queue({ content: editor.getHTML() }),
  });

  // Replace the editor's content with a server copy (newer save by someone else, or a restore).
  const applyServerCopy = useCallback(
    (copy: { title: string; content: string; updatedAt: string }) => {
      // Drop queued autosaves so they can't overwrite the copy we're switching to.
      pending.current = {};
      if (timer.current) clearTimeout(timer.current);
      editor?.commands.setContent(copy.content || "", false); // false: don't trigger autosave
      setTitle(copy.title);
      savedTitle.current = copy.title;
      lastKnownUpdatedAt.current = Date.parse(copy.updatedAt);
      setRemoteEditor(null);
    },
    [editor],
  );

  const loadLatest = useCallback(async () => {
    if (
      Object.keys(pending.current).length &&
      !(await confirm({
        title: "Load the latest version?",
        message: "Your unsaved changes in this tab will be replaced by the version someone else just saved.",
        confirmLabel: "Load latest",
      }))
    )
      return;
    pending.current = {};
    try {
      applyServerCopy(await api(`/api/documents/${doc.id}`));
      setSaveState("saved");
    } catch (e) {
      setSaveError((e as Error).message);
    }
  }, [applyServerCopy, confirm, doc.id]);

  // Presence heartbeat: who else is here + detect saves made by someone else (last-write-wins awareness).
  const presence = usePresence(doc.id);
  useEffect(() => {
    if (!presence.updatedAt || !presence.lastEditedBy || presence.lastEditedBy.id === currentUserId) return;
    if (Date.parse(presence.updatedAt) <= lastKnownUpdatedAt.current) return;
    if (!editable) void loadLatest(); // viewers just follow along
    else setRemoteEditor(presence.lastEditedBy.name);
  }, [presence.updatedAt, presence.lastEditedBy, currentUserId, editable, loadLatest]);

  // ---- Live collaboration (SSE): someone else saved → follow along when idle, otherwise offer to load.
  const [liveEditor, setLiveEditor] = useState<{ id: string; name: string } | null>(null);
  const liveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncRemote = useCallback(
    async (byName: string) => {
      try {
        const copy = await api<{ title: string; content: string; updatedAt: string }>(`/api/documents/${doc.id}`);
        // The user started typing while we fetched → don't clobber their edit; ask instead.
        if (Object.keys(pending.current).length || inFlight.current) return setRemoteEditor(byName);
        if (!editor) return;
        const { from, to } = editor.state.selection;
        const hadFocus = editor.isFocused;
        applyServerCopy(copy);
        if (hadFocus) {
          const max = editor.state.doc.content.size;
          editor.commands.setTextSelection({ from: Math.min(from, max), to: Math.min(to, max) });
        }
      } catch {
        /* transient; the presence fallback will catch up */
      }
    },
    [applyServerCopy, doc.id, editor],
  );

  useDocEvent(doc.id, "content", (e) => {
    if (e.by.id === currentUserId || Date.parse(e.updatedAt) <= lastKnownUpdatedAt.current) return;
    setLiveEditor(e.by);
    if (liveTimer.current) clearTimeout(liveTimer.current);
    liveTimer.current = setTimeout(() => setLiveEditor(null), 6000);
    const busy = Object.keys(pending.current).length > 0 || inFlight.current;
    if (busy && editable) setRemoteEditor(e.by.name);
    else void syncRemote(e.by.name);
  });

  const getSelectedText = useCallback(() => {
    if (!editor) return "";
    const { from, to } = editor.state.selection;
    return editor.state.doc.textBetween(from, to, " ").trim();
  }, [editor]);

  // Ctrl/Cmd+S saves immediately; warn before leaving with unsaved changes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void flush();
      }
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length || inFlight.current) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [flush]);

  function onTitleChange(value: string) {
    setTitle(value);
    const trimmed = value.trim();
    if (trimmed && trimmed !== savedTitle.current) queue({ title: trimmed.slice(0, MAX_TITLE_LENGTH) });
  }

  function onTitleBlur() {
    if (!title.trim()) setTitle(savedTitle.current); // empty titles aren't allowed — revert
  }

  async function deleteDocument() {
    const ok = await confirm({
      title: "Delete this document?",
      message: (
        <>
          <strong>{savedTitle.current}</strong> will be permanently deleted for you and everyone it&apos;s shared with,
          including its comments, history and attachments.
        </>
      ),
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await api(`/api/documents/${doc.id}`, { method: "DELETE" });
      router.push("/");
      router.refresh();
    } catch (e) {
      setDeleteError((e as Error).message);
    }
  }

  const status: Record<SaveState, string> = {
    saved: "All changes saved",
    unsaved: "Unsaved changes…",
    saving: "Saving…",
    error: "Couldn't save",
  };

  const statusIcon =
    saveState === "saving" ? (
      <Loader2 size={13} className="animate-spin" />
    ) : saveState === "error" ? (
      <CloudOff size={13} />
    ) : saveState === "unsaved" ? (
      <Cloud size={13} />
    ) : (
      <CloudCheck size={13} />
    );

  return (
    <div className="flex min-h-screen flex-col bg-[#f8f9fa]">
      {/* Docs-style header: logo · title + status · collaborators · actions · account */}
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2 px-3 pb-1.5 pt-2.5 sm:gap-3 sm:px-4">
          <Link
            href="/"
            title="All documents"
            className="shrink-0 rounded-lg transition hover:opacity-90"
          >
            <LogoMark size={40} />
          </Link>
          <div className="min-w-0 flex-1">
            <input
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              onBlur={onTitleBlur}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              readOnly={!editable}
              maxLength={MAX_TITLE_LENGTH}
              aria-label="Document title"
              className="w-full max-w-xl truncate rounded-md border border-transparent px-1.5 py-0.5 text-lg text-gray-900 hover:border-gray-300 focus:border-blue-500 focus:outline-none read-only:hover:border-transparent"
            />
            <div className="flex flex-wrap items-center gap-x-2 px-1.5 text-xs text-gray-500" aria-live="polite">
              <span className={`flex items-center gap-1 ${saveState === "error" ? "text-red-600" : ""}`} title={saveError ?? undefined}>
                {editable ? statusIcon : <Eye size={13} />}
                {editable ? status[saveState] : "View only"}
                {saveState === "error" && (
                  <button onClick={() => void flush()} className="ml-1 font-medium underline">
                    Retry
                  </button>
                )}
              </span>
              {liveEditor && (
                <span className="flex items-center gap-1 font-medium text-emerald-700">
                  <span aria-hidden>·</span> <Pencil size={12} /> {liveEditor.name} is editing…
                </span>
              )}
              {!isOwner && (
                <span className="flex items-center gap-1">
                  <span aria-hidden>·</span> Shared by {doc.owner.name} · {editable ? "Can edit" : "Can view"}
                </span>
              )}
            </div>
          </div>

          {presence.active.length > 0 && (
            <div className="hidden -space-x-2 sm:flex" aria-label="People viewing this document">
              {presence.active.slice(0, 4).map((u, i) => (
                <span
                  key={u.id}
                  title={liveEditor?.id === u.id ? `${u.name} is editing` : `${u.name} is viewing`}
                  className={`grid h-8 w-8 place-items-center rounded-full border-2 border-white text-xs font-semibold text-white transition ${
                    ["bg-emerald-600", "bg-amber-600", "bg-purple-600", "bg-rose-600"][i % 4]
                  } ${liveEditor?.id === u.id ? "ring-2 ring-emerald-400 ring-offset-1" : ""}`}
                >
                  {initials(u.name)}
                </span>
              ))}
              {presence.active.length > 4 && (
                <span className="grid h-8 w-8 place-items-center rounded-full border-2 border-white bg-gray-400 text-[10px] font-semibold text-white">
                  +{presence.active.length - 4}
                </span>
              )}
            </div>
          )}

          <div className="flex items-center gap-0.5">
            <IconButton title="Version history" onClick={() => setHistoryOpen(true)}>
              <HistoryIcon size={19} />
            </IconButton>
            <div className="relative">
              <IconButton
                title="Download"
                onClick={() => setExportOpen((o) => !o)}
                onBlur={() => setTimeout(() => setExportOpen(false), 150)}
                expanded={exportOpen}
              >
                <Download size={19} />
              </IconButton>
              {exportOpen && (
                <div className="absolute right-0 z-30 mt-1 w-52 overflow-hidden rounded-xl border border-gray-200 bg-white p-1 text-sm shadow-lg">
                  <p className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-gray-400">Download as</p>
                  <button
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-gray-700 hover:bg-gray-100"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setExportOpen(false);
                      printToPdf(title);
                    }}
                  >
                    <FileDown size={16} className="text-red-600" /> PDF document
                  </button>
                  <button
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-gray-700 hover:bg-gray-100"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={async () => {
                      setExportOpen(false);
                      await flush(); // export the latest content, not the last autosave
                      window.location.href = `/api/documents/${doc.id}/export?format=docx`;
                    }}
                  >
                    <FileType size={16} className="text-blue-600" /> Word (.docx)
                  </button>
                  <button
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-gray-700 hover:bg-gray-100"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setExportOpen(false);
                      downloadMarkdown(title, editor?.getHTML() ?? doc.content);
                    }}
                  >
                    <FileCode size={16} className="text-gray-700" /> Markdown (.md)
                  </button>
                </div>
              )}
            </div>
            {isOwner && (
              <IconButton title="Delete document" onClick={deleteDocument} danger>
                <Trash2 size={18} />
              </IconButton>
            )}
          </div>

          {isOwner && (
            <button
              onClick={() => setShareOpen(true)}
              className="flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 sm:px-5"
            >
              <Lock size={15} />
              Share
              {shareCount > 0 && <span className="rounded-full bg-white/20 px-1.5 text-xs">{shareCount}</span>}
            </button>
          )}
          <NotificationBell />
          <UserMenu name={currentUser.name} email={currentUser.email} />
        </div>
        {editable && editor && (
          <div className="px-3 pb-2 sm:px-4">
            <Toolbar editor={editor} />
          </div>
        )}
      </header>

      {saveState === "error" && saveError && (
        <Banner tone="red" role="alert">
          {saveError} Your changes are kept in this tab —{" "}
          <button onClick={() => void flush()} className="font-medium underline">
            try again
          </button>
        </Banner>
      )}
      {deleteError && (
        <Banner tone="red" role="alert">
          {deleteError}
        </Banner>
      )}
      {remoteEditor && (
        <Banner tone="blue" role="status">
          <RefreshCw size={14} /> {remoteEditor} saved changes to this document.
          <button onClick={() => void loadLatest()} className="font-medium underline">
            Load latest
          </button>
        </Banner>
      )}
      {!editable && (
        <Banner tone="amber">
          <Eye size={14} /> You have view-only access. Ask {doc.owner.name} for edit access.
        </Banner>
      )}

      {/* Page canvas + side panel */}
      <div className="flex w-full flex-1 flex-col items-center gap-6 px-3 py-6 sm:px-6 lg:flex-row lg:items-start lg:justify-center">
        <div className="doc-content print-area w-full min-w-0 max-w-[816px] rounded-sm bg-white px-6 py-10 shadow-[0_1px_3px_rgba(60,64,67,0.15),0_4px_12px_rgba(60,64,67,0.08)] sm:px-[72px] sm:py-[64px] lg:min-h-[1056px]">
          <h1 className="mb-6 hidden text-3xl font-bold print:block">{title}</h1>
          {editor ? <EditorContent editor={editor} /> : <div className="h-[60vh] animate-pulse rounded bg-gray-50" />}
        </div>
        <aside className="flex w-full max-w-[816px] shrink-0 flex-col gap-4 lg:sticky lg:top-32 lg:w-80">
          <CommentsPanel documentId={doc.id} currentUserId={currentUserId} access={doc.access} getSelectedText={getSelectedText} />
          <AttachmentsPanel documentId={doc.id} canManage={can.manageAttachments(doc.access)} initial={initialAttachments} />
        </aside>
      </div>

      {confirmDialog}
      {historyOpen && (
        <VersionHistory
          documentId={doc.id}
          canRestore={editable}
          onClose={() => setHistoryOpen(false)}
          onRestored={(copy) => {
            applyServerCopy(copy);
            setSaveState("saved");
          }}
        />
      )}

      {isOwner && shareOpen && (
        <ShareDialog
          documentId={doc.id}
          owner={doc.owner}
          initialShares={initialShares}
          onClose={() => setShareOpen(false)}
          onChange={(n) => setShareCount(n)}
        />
      )}
    </div>
  );
}

function IconButton({
  title,
  onClick,
  onBlur,
  expanded,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  onBlur?: () => void;
  expanded?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-expanded={expanded}
      onClick={onClick}
      onBlur={onBlur}
      className={`grid h-9 w-9 place-items-center rounded-full text-gray-600 transition-colors ${
        danger ? "hover:bg-red-50 hover:text-red-600" : "hover:bg-gray-100"
      }`}
    >
      {children}
    </button>
  );
}

function Banner({
  tone,
  role,
  children,
}: {
  tone: "red" | "blue" | "amber";
  role?: "alert" | "status";
  children: React.ReactNode;
}) {
  const tones = {
    red: "bg-red-50 text-red-700 border-red-100",
    blue: "bg-blue-50 text-blue-800 border-blue-100",
    amber: "bg-amber-50 text-amber-800 border-amber-100",
  };
  return (
    <div role={role} className={`flex items-center justify-center gap-2 border-b px-4 py-2 text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}
