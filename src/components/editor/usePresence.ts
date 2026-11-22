"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLiveEvent } from "@/lib/live-client";

export type PresenceUser = { id: string; name: string };
export type PresenceState = {
  active: PresenceUser[];
  updatedAt: string | null;
  lastEditedBy: PresenceUser | null;
};

/** Fallback heartbeat; joins/leaves are pushed live over the document's SSE stream. */
const HEARTBEAT_MS = 15_000;

/** Reports who else has the document open, updated live via SSE plus a slow heartbeat. */
export function usePresence(documentId: string): PresenceState {
  const [state, setState] = useState<PresenceState>({ active: [], updatedAt: null, lastEditedBy: null });
  const alive = useRef(true);
  const url = `/api/documents/${documentId}/presence`;

  const beat = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    try {
      const res = await fetch(url, { method: "POST" });
      if (res.ok && alive.current) setState(await res.json());
    } catch {
      /* offline — try again next tick */
    }
  }, [url]);

  // Someone joined or left → refresh the list now.
  useLiveEvent("presence", () => void beat());

  useEffect(() => {
    alive.current = true;
    void beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    const onVisible = () => document.visibilityState === "visible" && void beat();
    document.addEventListener("visibilitychange", onVisible);
    const leave = () => void fetch(url, { method: "DELETE", keepalive: true }).catch(() => {});
    window.addEventListener("pagehide", leave);
    return () => {
      alive.current = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [beat, url]);

  return state;
}
