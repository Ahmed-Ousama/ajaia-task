import { prisma } from "@/lib/db";
import { loadDocumentWithAccess } from "@/lib/documents";
import { handle, requireApiUser } from "@/lib/http";
import { connections, publish, sseResponse, subscribe } from "@/lib/realtime";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Server-Sent Events stream for one document: comments, presence and saved-content changes are
 * pushed as they happen. An open stream also *is* presence — connecting marks the user as here,
 * closing the last tab removes them immediately instead of waiting for a heartbeat timeout.
 */
export const GET = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireApiUser();
  const { doc } = await loadDocumentWithAccess((await params).id, user.id);
  const key = `${doc.id}:${user.id}`;

  connections.set(key, (connections.get(key) ?? 0) + 1);
  await prisma.documentPresence.upsert({
    where: { documentId_userId: { documentId: doc.id, userId: user.id } },
    update: { lastSeenAt: new Date() },
    create: { documentId: doc.id, userId: user.id },
  });
  publish(doc.id, { type: "presence" });

  return sseResponse(
    req,
    (send) => subscribe(doc.id, send),
    () => {
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
