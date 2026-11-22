"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, CheckCheck, MessageSquare, Share2, ShieldCheck, Undo2 } from "lucide-react";
import { api, jsonInit } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { useLiveEvent } from "@/lib/live-client";

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

const POLL_MS = 60_000; // fallback only; new notifications are pushed over the live stream

function describe(n: Item) {
  if (n.type === "COMMENT_ADDED") {
    return { icon: MessageSquare, lead: `${n.actor.name} commented on`, tail: n.excerpt ? `“${n.excerpt}”` : "" };
  }
  const access = n.role === "EDITOR" ? "can edit" : "can view";
  return n.type === "DOCUMENT_SHARED"
    ? { icon: Share2, lead: `${n.actor.name} shared`, tail: `with you · you ${access}` }
    : { icon: ShieldCheck, lead: `${n.actor.name} changed your access to`, tail: `· you ${access} now` };
}

/**
 * Header bell. Opening the panel marks everything as read (the badge clears); items that were new
 * keep a "new" highlight while the panel is open. Each item can be toggled read/unread.
 */
export default function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  /** Ids that were unread when the panel was opened — highlighted as "new" for this viewing. */
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const box = useRef<HTMLDivElement>(null);
  const openRef = useRef(false);
  const lastUnread = useRef(0);

  const setRead = useCallback(async (ids: string[] | undefined, read: boolean) => {
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (!ids || ids.includes(n.id) ? { ...n, readAt: read ? (n.readAt ?? now) : null } : n)));
    await api("/api/notifications/read", jsonInit("POST", { ids, read })).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await api<{ unread: number; items: Item[] }>("/api/notifications");
      // Something new was shared/commented → refresh server-rendered lists (e.g. "Shared with me").
      if (data.unread > lastUnread.current) router.refresh();
      if (openRef.current && data.unread > 0) {
        // Panel is open: new arrivals are seen right away.
        const newIds = data.items.filter((n) => !n.readAt).map((n) => n.id);
        setFresh((prev) => new Set([...prev, ...newIds]));
        setItems(data.items);
        setUnread(0);
        lastUnread.current = 0;
        void setRead(newIds, true);
        return;
      }
      setItems(data.items);
      setUnread(data.unread);
      lastUnread.current = data.unread;
    } catch {
      /* transient network errors: keep the last state */
    }
  }, [router, setRead]);

  useLiveEvent("notification", () => void load());

  useEffect(() => {
    void load();
    const timer = setInterval(load, POLL_MS);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  function toggle() {
    const next = !open;
    setOpen(next);
    openRef.current = next;
    if (next) {
      const newIds = items.filter((n) => !n.readAt).map((n) => n.id);
      setFresh(new Set(newIds));
      if (newIds.length) {
        setUnread(0);
        lastUnread.current = 0;
        void setRead(newIds, true);
      }
    }
  }

  useEffect(() => {
    if (!open) return;
    const close = () => {
      setOpen(false);
      openRef.current = false;
    };
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function openItem(n: Item) {
    setOpen(false);
    openRef.current = false;
    if (!n.readAt) void setRead([n.id], true);
    router.push(`/documents/${n.document.id}`);
  }

  function toggleRead(n: Item) {
    const makeRead = !n.readAt;
    void setRead([n.id], makeRead);
    setUnread((u) => Math.max(0, u + (makeRead ? -1 : 1)));
    lastUnread.current = Math.max(0, lastUnread.current + (makeRead ? -1 : 1));
    if (!makeRead) setFresh((prev) => new Set([...prev, n.id]));
  }

  return (
    <div className="relative" ref={box}>
      <button
        onClick={toggle}
        className="relative grid h-9 w-9 place-items-center rounded-full text-gray-600 hover:bg-gray-100"
        aria-label={unread ? `Notifications (${unread} unread)` : "Notifications"}
        aria-expanded={open}
        data-testid="notification-bell"
      >
        <Bell size={20} />
        {unread > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[11px] font-semibold text-white"
            data-testid="notification-count"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
            <span className="text-sm font-semibold text-gray-900">Notifications</span>
            {items.some((n) => !n.readAt) && (
              <button onClick={() => void setRead(undefined, true)} className="flex items-center gap-1 text-xs text-blue-700 hover:underline">
                <CheckCheck size={14} /> Mark all as read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-500">No notifications yet.</p>
          ) : (
            <ul className="max-h-[28rem] overflow-y-auto" data-testid="notification-list">
              {items.map((n) => {
                const { icon: Icon, lead, tail } = describe(n);
                const isNew = fresh.has(n.id) || !n.readAt;
                return (
                  <li key={n.id} className={`group relative ${isNew ? "bg-blue-50/70" : ""}`}>
                    <button onClick={() => openItem(n)} className="flex w-full gap-3 px-4 py-3 pr-12 text-left hover:bg-gray-50/80">
                      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gray-100 text-gray-600">
                        <Icon size={15} />
                      </span>
                      <span className="min-w-0 text-sm text-gray-700">
                        {lead} <span className="font-medium text-gray-900">{n.document.title}</span> {tail}
                        <span className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                          {formatDate(n.createdAt)}
                          {isNew && <span className="rounded-full bg-blue-600 px-1.5 py-px text-[10px] font-semibold text-white">NEW</span>}
                        </span>
                      </span>
                    </button>
                    <button
                      onClick={() => toggleRead(n)}
                      title={n.readAt ? "Mark as unread" : "Mark as read"}
                      aria-label={n.readAt ? "Mark as unread" : "Mark as read"}
                      className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full text-gray-400 opacity-0 transition hover:bg-gray-200 hover:text-gray-700 focus:opacity-100 group-hover:opacity-100"
                    >
                      {n.readAt ? <Undo2 size={14} /> : <Check size={14} />}
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
