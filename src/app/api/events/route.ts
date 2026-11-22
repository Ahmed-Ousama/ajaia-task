import { prisma } from "@/lib/db";
import { loadDocumentWithAccess } from "@/lib/documents";
import { handle, requireApiUser } from "@/lib/http";
import { connections, publish, sseResponse, subscribe, subscribeUser } from "@/lib/realtime";

export const dynamic = "force-dynamic";

/**
 * The tab's single Server-Sent Events stream (one connection per tab keeps HTTP/1.1 browsers
 * well under their 6-connections-per-host limit).
 *  - always: the user's own channel ("you have a new notification")
 *  - with ?doc=<id>: that document's channel (presence, typing, saved content, comments).
 *    An open stream *is* presence: connecting marks you as here, closing the last tab removes you.
 */
export const GET = handle(async (req: Request) => {
  const user = await requireApiUser();
  const docParam = new URL(req.url).searchParams.get("doc");
  const doc = docParam ? (await loadDocumentWithAccess(docParam, user.id)).doc : null;
  const key = doc ? `${doc.id}:${user.id}` : null;

  if (doc && key) {
    connections.set(key, (connections.get(key) ?? 0) + 1);
    await prisma.documentPresence.upsert({
      where: { documentId_userId: { documentId: doc.id, userId: user.id } },
      update: { lastSeenAt: new Date() },
      create: { documentId: doc.id, userId: user.id },
    });
    publish(doc.id, { type: "presence" });
  }

  return sseResponse(
    req,
    (send) => {
      const offUser = subscribeUser(user.id, send);
      const offDoc = doc ? subscribe(doc.id, send) : () => {};
      return () => {
        offUser();
        offDoc();
      };
    },
    () => {
      if (!doc || !key) return;
      const left = (connections.get(key) ?? 1) - 1;
      if (left > 0) return void connections.set(key, left);
      connections.delete(key);
      void prisma.documentPresence
        .deleteMany({ where: { documentId: doc.id, userId: user.id } })
        .then(() => publish(doc.id, { type: "presence" }))
        .catch(() => {});
    },
  );
});
