import { EventEmitter } from "node:events";

/**
 * In-process pub/sub for per-document live events, delivered to browsers over SSE
 * (`/api/documents/:id/events`). One app instance serves everything in this deployment;
 * scaling out would swap this for Postgres LISTEN/NOTIFY or Redis pub/sub behind the same API.
 */
export type DocEvent =
  | { type: "hello" }
  | { type: "presence" }
  | { type: "comments" }
  | { type: "typing"; by: { id: string; name: string } }
  | { type: "cursor"; by: { id: string; name: string }; from: number; to: number }
  | { type: "content"; updatedAt: string; by: { id: string; name: string } };

const g = globalThis as unknown as {
  __ajaiaBus?: EventEmitter;
  __ajaiaConns?: Map<string, number>;
  __ajaiaLog?: { seq: number; entries: { seq: number; topic: string; event: unknown }[] };
};
const bus = (g.__ajaiaBus ??= (() => {
  const e = new EventEmitter();
  e.setMaxListeners(0);
  return e;
})());

/** Open SSE connections per `${documentId}:${userId}` (a user may have several tabs). */
export const connections = (g.__ajaiaConns ??= new Map<string, number>());

/**
 * Recent events, kept for the long-poll fallback (used when a proxy buffers SSE, e.g. Cloudflare
 * quick tunnels). Bounded ring: the last 1000 events.
 */
const log = (g.__ajaiaLog ??= { seq: 0, entries: [] });

function record(topic: string, event: unknown) {
  log.seq += 1;
  log.entries.push({ seq: log.seq, topic, event });
  if (log.entries.length > 1000) log.entries.splice(0, log.entries.length - 1000);
  bus.emit("any", topic);
}

export const currentSeq = () => log.seq;

export function eventsSince(since: number, topics: string[]) {
  return log.entries.filter((e) => e.seq > since && topics.includes(e.topic)).map((e) => e.event);
}

/** Resolves when an event for one of the topics is published, or after `ms`. */
export function waitForEvent(topics: string[], ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      bus.off("any", onAny);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const onAny = (topic: string) => topics.includes(topic) && done();
    const timer = setTimeout(done, ms);
    bus.on("any", onAny);
    signal.addEventListener("abort", done);
  });
}

export function publish(documentId: string, event: DocEvent) {
  bus.emit(`doc:${documentId}`, event);
  record(`doc:${documentId}`, event);
}

export function subscribe(documentId: string, listener: (e: DocEvent) => void) {
  bus.on(`doc:${documentId}`, listener);
  return () => bus.off(`doc:${documentId}`, listener);
}

/** Per-user channel: "you have a new notification" (drives the header bell). */
export function publishToUser(userId: string) {
  bus.emit(`user:${userId}`, { type: "notification" });
  record(`user:${userId}`, { type: "notification" });
}

export function subscribeUser(userId: string, listener: (e: { type: "notification" }) => void) {
  bus.on(`user:${userId}`, listener);
  return () => bus.off(`user:${userId}`, listener);
}

/** Builds an SSE Response from a subscribe function; handles pings and teardown on disconnect. */
export function sseResponse(
  req: Request,
  attach: (send: (data: unknown) => void) => () => void,
  onClose?: () => void,
) {
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          /* closed */
        }
      };
      write("retry: 3000\n\n");
      write(`data: ${JSON.stringify({ type: "hello" })}\n\n`); // lets the client detect buffering proxies
      const detach = attach((data) => write(`data: ${JSON.stringify(data)}\n\n`));
      const ping = setInterval(() => write(": ping\n\n"), 20_000);
      let closed = false;
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        detach();
        onClose?.();
        try {
          controller.close();
        } catch {
          /* closed */
        }
      };
      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform", // no-transform: stops gzip from buffering the stream
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
