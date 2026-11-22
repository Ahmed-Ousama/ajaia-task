import { EventEmitter } from "node:events";

/**
 * In-process pub/sub for per-document live events, delivered to browsers over SSE
 * (`/api/documents/:id/events`). One app instance serves everything in this deployment;
 * scaling out would swap this for Postgres LISTEN/NOTIFY or Redis pub/sub behind the same API.
 */
export type DocEvent =
  | { type: "presence" }
  | { type: "comments" }
  | { type: "typing"; by: { id: string; name: string } }
  | { type: "content"; updatedAt: string; by: { id: string; name: string } };

const g = globalThis as unknown as { __ajaiaBus?: EventEmitter; __ajaiaConns?: Map<string, number> };
const bus = (g.__ajaiaBus ??= (() => {
  const e = new EventEmitter();
  e.setMaxListeners(0);
  return e;
})());

/** Open SSE connections per `${documentId}:${userId}` (a user may have several tabs). */
export const connections = (g.__ajaiaConns ??= new Map<string, number>());

export function publish(documentId: string, event: DocEvent) {
  bus.emit(`doc:${documentId}`, event);
}

export function subscribe(documentId: string, listener: (e: DocEvent) => void) {
  bus.on(`doc:${documentId}`, listener);
  return () => bus.off(`doc:${documentId}`, listener);
}

/** Per-user channel: "you have a new notification" (drives the header bell). */
export function publishToUser(userId: string) {
  bus.emit(`user:${userId}`, { type: "notification" });
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
