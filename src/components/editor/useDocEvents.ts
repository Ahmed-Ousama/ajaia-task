"use client";

import { useEffect, useRef } from "react";

export type DocEvent =
  | { type: "presence" }
  | { type: "comments" }
  | { type: "content"; updatedAt: string; by: { id: string; name: string } };

type Listener = (e: DocEvent) => void;

/** One shared EventSource per document, ref-counted across all components that listen. */
const channels = new Map<string, { source: EventSource; listeners: Set<Listener> }>();

function join(documentId: string, listener: Listener) {
  let ch = channels.get(documentId);
  if (!ch) {
    const source = new EventSource(`/api/documents/${documentId}/events`);
    const listeners = new Set<Listener>();
    source.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data) as DocEvent;
        listeners.forEach((l) => l(event));
      } catch {
        /* ignore malformed frames */
      }
    };
    ch = { source, listeners };
    channels.set(documentId, ch);
  }
  ch.listeners.add(listener);
  return () => {
    ch!.listeners.delete(listener);
    if (ch!.listeners.size === 0) {
      ch!.source.close();
      channels.delete(documentId);
    }
  };
}

/** Subscribe to live events for a document. `type` filters; the latest handler is always used. */
export function useDocEvent<T extends DocEvent["type"]>(
  documentId: string,
  type: T,
  handler: (e: Extract<DocEvent, { type: T }>) => void,
) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(
    () =>
      join(documentId, (e) => {
        if (e.type === type) ref.current(e as Extract<DocEvent, { type: T }>);
      }),
    [documentId, type],
  );
}
