"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, jsonInit } from "@/lib/api-client";
import { formatDate } from "@/lib/format";

type Item = {
  id: string;
  type: "DOCUMENT_SHARED" | "SHARE_ROLE_CHANGED" | "COMMENT_ADDED";
  role: "VIEWER" | "EDITOR" | null;
  excerpt: string | null;
  readAt: string | null;
  createdAt: string;
  actor: { name: string };
  document: { id: string; title: string };
};

const POLL_MS = 60_000; // fallback; new notifications are pushed over SSE

function describe(n: Item) {
  if (n.type === "COMMENT_ADDED") {
    return { lead: `${n.actor.name} commented on`, tail: n.excerpt ? `: “${n.excerpt}”` : "" };
  }
  const access = n.role === "EDITOR" ? "can edit" : "can view";
  return n.type === "DOCUMENT_SHARED"
    ? { lead: `${n.actor.name} shared`, tail: `with you · you ${access}` }
    : { lead: `${n.actor.name} changed your access to`, tail: `· you ${access} now` };
}

/** Header bell: unread count + recent "shared with you" notifications. Polls every 30 s and on focus. */
export default function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const lastUnread = useRef(0);

  const load = useCallback(async () => {
    try {
      const data = await api<{ unread: number; items: Item[] }>("/api/notifications");
      setItems(data.items);
      setUnread(data.unread);
      // Something new was shared → refresh server-rendered lists (e.g. "Shared with me").
      if (data.unread > lastUnread.current) router.refresh();
      lastUnread.current = data.unread;
    } catch {
      /* transient network errors: keep the last state, try again on the next tick */
    }
  }, [router]);

  useEffect(() => {
    void load();
    const timer = setInterval(load, POLL_MS);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    // Live push: the server pings this stream whenever a notification is created for us.
    const live = new EventSource("/api/notifications/events");
    live.onmessage = () => void load();
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      live.close();
    };
  }, [load]);

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

  async function markRead(ids?: string[]) {
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (!ids || ids.includes(n.id) ? { ...n, readAt: n.readAt ?? now } : n)));
    setUnread((u) => (ids ? Math.max(0, u - ids.length) : 0));
    lastUnread.current = ids ? Math.max(0, lastUnread.current - ids.length) : 0;
    await api("/api/notifications/read", jsonInit("POST", ids ? { ids } : {})).catch(() => load());
  }

  function openItem(n: Item) {
    setOpen(false);
    if (!n.readAt) void markRead([n.id]);
    router.push(`/documents/${n.document.id}`);
  }

  return (
    <div className="relative" ref={box}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative grid h-9 w-9 place-items-center rounded-full text-gray-600 hover:bg-gray-100"
        aria-label={unread ? `Notifications (${unread} unread)` : "Notifications"}
        aria-expanded={open}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[11px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
            <span className="text-sm font-semibold text-gray-900">Notifications</span>
            {unread > 0 && (
              <button onClick={() => markRead()} className="text-xs text-blue-700 hover:underline">
                Mark all as read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-500">No notifications yet.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {items.map((n) => {
                const { lead, tail } = describe(n);
                return (
                  <li key={n.id}>
                    <button
                      onClick={() => openItem(n)}
                      className={`flex w-full gap-3 px-4 py-3 text-left hover:bg-gray-50 ${n.readAt ? "" : "bg-blue-50/60"}`}
                    >
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-blue-600"}`}
                        aria-hidden
                      />
                      <span className="min-w-0 text-sm text-gray-700">
                        {lead} <span className="font-medium text-gray-900">{n.document.title}</span> {tail}
                        <span className="mt-0.5 block text-xs text-gray-500">{formatDate(n.createdAt)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
