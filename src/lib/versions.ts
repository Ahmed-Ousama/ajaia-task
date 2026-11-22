import type { Prisma } from "@prisma/client";

/** Edits by the same person within this window are folded into one version ("editing session"). */
export const VERSION_WINDOW_MS = 5 * 60 * 1000;

type Tx = Prisma.TransactionClient;
type DocState = { id: string; title: string; content: string; ownerId: string; lastEditedById: string | null; updatedAt: Date };

/**
 * Call inside the save transaction, after the document row was updated.
 * - First save ever: also stores the pre-edit state as a baseline version.
 * - Same author within VERSION_WINDOW_MS of their latest version: update that version in place.
 * - Otherwise: start a new version.
 * So each version = the document as it stood at the end of one person's editing session.
 */
export async function recordVersion(tx: Tx, before: DocState, after: { title: string; content: string }, userId: string) {
  const latest = await tx.documentVersion.findFirst({
    where: { documentId: before.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, authorId: true, createdAt: true },
  });

  if (!latest) {
    await tx.documentVersion.create({
      data: {
        documentId: before.id,
        title: before.title,
        content: before.content,
        authorId: before.lastEditedById ?? before.ownerId,
        createdAt: before.updatedAt,
      },
    });
  } else if (latest.authorId === userId && Date.now() - latest.createdAt.getTime() < VERSION_WINDOW_MS) {
    await tx.documentVersion.update({ where: { id: latest.id }, data: { title: after.title, content: after.content } });
    return;
  }

  await tx.documentVersion.create({
    data: { documentId: before.id, title: after.title, content: after.content, authorId: userId },
  });
}
