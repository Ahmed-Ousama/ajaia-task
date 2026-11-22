import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { can } from "@/lib/access";
import { loadDocumentWithAccess } from "@/lib/documents";
import { forbidden, handle, HttpError, requireApiUser } from "@/lib/http";
import { publish } from "@/lib/realtime";

type Ctx = { params: Promise<{ id: string; versionId: string }> };

/**
 * Restores a version: the document gets the version's title + content, and a new version is
 * always recorded for the restore itself — so restoring is undoable and visible in history.
 */
export const POST = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireApiUser();
  const { id, versionId } = await params;
  const { doc, access } = await loadDocumentWithAccess(id, user.id);
  if (!can.edit(access)) throw forbidden("You have view-only access to this document.");

  const version = await prisma.documentVersion.findFirst({
    where: { id: versionId, documentId: doc.id },
    select: { title: true, content: true },
  });
  if (!version) throw new HttpError(404, "Version not found.");

  const restored = await prisma.$transaction(async (tx) => {
    const saved = await tx.document.update({
      where: { id: doc.id },
      data: { title: version.title, content: version.content, lastEditedById: user.id },
      select: { title: true, content: true, updatedAt: true },
    });
    await tx.documentVersion.create({
      data: { documentId: doc.id, title: saved.title, content: saved.content, authorId: user.id },
    });
    return saved;
  });
  publish(doc.id, { type: "content", updatedAt: restored.updatedAt.toISOString(), by: { id: user.id, name: user.name } });
  return NextResponse.json(restored);
});
