"use client";

import { useEffect, useRef, useState } from "react";

/** Events pushed over the tab's single SSE stream (`/api/events`). */
export type LiveEvent =
  | { type: "notification" }
  | { type: "presence" }
  | { type: "comments" }
  | { type: "typing"; by: { id: string; name: string } }
  | { type: "content"; updatedAt: string; by: { id: string; name: string } };

export type LiveStatus = "connecting" | "live" | "reconnecting";

type Listener = (e: LiveEvent) => void;

// ---- one EventSource per tab, shared by every component (module singleton) ----
const listeners = new Set<Listener>();
const statusListeners = new Set<(s: LiveStatus) => void>();
const docRefs = new Map<string, number>();
let source: EventSource | null = null;
let sourceUrl = "";
let status: LiveStatus = "connecting";
let reconcileTimer: ReturnType<typeof setTimeout> | null = null;

function setStatus(s: LiveStatus) {
  status = s;
  statusListeners.forEach((l) => l(s));
}

function desiredUrl() {
  const doc = [...docRefs.keys()][0];
  return doc ? `/api/events?doc=${encodeURIComponent(doc)}` : "/api/events";
}

/** (Re)open or close the stream to match who is listening. Batched so mount/unmount bursts open one stream. */
function reconcile() {
  if (reconcileTimer) clearTimeout(reconcileTimer);
  reconcileTimer = setTimeout(() => {
    reconcileTimer = null;
    const wanted = listeners.size > 0 ? desiredUrl() : "";
    if (wanted === sourceUrl) return;
    source?.close();
    source = null;
    sourceUrl = wanted;
    if (!wanted) return;
    setStatus("connecting");
    const es = new EventSource(wanted);
    es.onopen = () => setStatus("live");
    es.onerror = () => setStatus(es.readyState === EventSource.CLOSED ? "reconnecting" : "reconnecting");
    es.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data) as LiveEvent;
        listeners.forEach((l) => l(event));
      } catch {
        /* ignore malformed frames */
      }
    };
    source = es;
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
