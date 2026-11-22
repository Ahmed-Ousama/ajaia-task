"use client";

import { useEffect, useRef, useState } from "react";

/** Events pushed over the tab's single SSE stream (`/api/events`). */
export type LiveEvent =
  | { type: "hello" }
  | { type: "notification" }
  | { type: "presence" }
  | { type: "comments" }
  | { type: "typing"; by: { id: string; name: string } }
  | { type: "cursor"; by: { id: string; name: string }; from: number; to: number }
  | { type: "content"; updatedAt: string; by: { id: string; name: string } };

export type LiveStatus = "connecting" | "live" | "reconnecting";

type Listener = (e: LiveEvent) => void;

// ---- one live connection per tab, shared by every component (module singleton) ----
// Transport: Server-Sent Events by default. The server's first frame is a "hello"; if it doesn't
// arrive within HELLO_TIMEOUT_MS, something in between is buffering the stream (e.g. a Cloudflare
// quick tunnel), so we switch this page to long-polling /api/events/poll — same events, same API.
const HELLO_TIMEOUT_MS = 3500;
const listeners = new Set<Listener>();
const statusListeners = new Set<(s: LiveStatus) => void>();
const docRefs = new Map<string, number>();
let status: LiveStatus = "connecting";
let mode: "sse" | "poll" = "sse";
let activeKey: string | null = null; // doc id ("" = user channel only) we're connected for
let stop: (() => void) | null = null;
let reconcileTimer: ReturnType<typeof setTimeout> | null = null;

function setStatus(s: LiveStatus) {
  status = s;
  statusListeners.forEach((l) => l(s));
}

function dispatch(event: LiveEvent) {
  if (event.type === "hello") return;
  listeners.forEach((l) => l(event));
}

/**
 * Events published while we were disconnected (or whose follow-up fetch failed while offline) are
 * missed, so on every (re)connect and whenever the browser comes back online, every listener reloads.
 */
function resyncAll() {
  const resync: LiveEvent[] = [{ type: "comments" }, { type: "presence" }, { type: "notification" }];
  resync.forEach((e) => listeners.forEach((l) => l(e)));
}
if (typeof window !== "undefined") window.addEventListener("online", resyncAll);

function connectSse(doc: string) {
  const es = new EventSource(doc ? `/api/events?doc=${encodeURIComponent(doc)}` : "/api/events");
  let gotHello = false;
  const helloTimer = setTimeout(() => {
    if (gotHello) return;
    es.close();
    mode = "poll"; // sticky for this page load
    stop = connectPoll(doc);
  }, HELLO_TIMEOUT_MS);
  es.onerror = () => setStatus("reconnecting"); // EventSource retries automatically
  es.onmessage = (msg) => {
    let event: LiveEvent;
    try {
      event = JSON.parse(msg.data) as LiveEvent;
    } catch {
      return;
    }
    if (event.type === "hello") {
      gotHello = true;
      clearTimeout(helloTimer);
      setStatus("live");
      resyncAll(); // (re)connected: reload anything we may have missed
      return;
    }
    dispatch(event);
  };
  return () => {
    clearTimeout(helloTimer);
    es.close();
  };
}

function connectPoll(doc: string) {
  const ctrl = new AbortController();
  void (async () => {
    let since = 0;
    while (!ctrl.signal.aborted) {
      try {
        const qs = new URLSearchParams({ since: String(since), ...(doc ? { doc } : {}) });
        const res = await fetch(`/api/events/poll?${qs}`, { signal: ctrl.signal, cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { seq: number; events: LiveEvent[] };
        if (since === 0) resyncAll();
        since = data.seq;
        setStatus("live");
        data.events.forEach(dispatch);
      } catch {
        if (ctrl.signal.aborted) return;
        setStatus("reconnecting");
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  })();
  return () => ctrl.abort();
}

/** (Re)connect or disconnect to match who is listening. Batched so mount/unmount bursts connect once. */
function reconcile() {
  if (reconcileTimer) clearTimeout(reconcileTimer);
  reconcileTimer = setTimeout(() => {
    reconcileTimer = null;
    const wanted = listeners.size > 0 ? ([...docRefs.keys()][0] ?? "") : null;
    if (wanted === activeKey) return;
    stop?.();
    stop = null;
    activeKey = wanted;
    if (wanted === null) return;
    setStatus("connecting");
    stop = mode === "poll" ? connectPoll(wanted) : connectSse(wanted);
  }, 30);
}

/** Subscribe to one live event type; the latest handler is always used. */
export function useLiveEvent<T extends LiveEvent["type"]>(type: T, handler: (e: Extract<LiveEvent, { type: T }>) => void) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    const l: Listener = (e) => {
      if (e.type === type) ref.current(e as Extract<LiveEvent, { type: T }>);
    };
    listeners.add(l);
    reconcile();
    return () => {
      listeners.delete(l);
      reconcile();
    };
  }, [type]);
}

/** Joins a document's live channel (presence, typing, content, comments) while mounted. */
export function useLiveDocument(documentId: string) {
  useEffect(() => {
    docRefs.set(documentId, (docRefs.get(documentId) ?? 0) + 1);
    reconcile();
    return () => {
      const n = (docRefs.get(documentId) ?? 1) - 1;
      if (n > 0) docRefs.set(documentId, n);
      else docRefs.delete(documentId);
      reconcile();
    };
  }, [documentId]);
}

export function useLiveStatus(): LiveStatus {
  const [s, setS] = useState<LiveStatus>(status);
  useEffect(() => {
    statusListeners.add(setS);
    setS(status);
    return () => {
      statusListeners.delete(setS);
    };
  }, []);
  return s;
}
