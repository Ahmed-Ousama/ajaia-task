import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { loadDocumentWithAccess } from "@/lib/documents";
import { handle, HttpError, requireApiUser } from "@/lib/http";

type Ctx = { params: Promise<{ id: string; versionId: string }> };

/** Full snapshot of one version, for the read-only preview. */
export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireApiUser();
  const { id, versionId } = await params;
  const { doc } = await loadDocumentWithAccess(id, user.id);
  const version = await prisma.documentVersion.findFirst({
    where: { id: versionId, documentId: doc.id }, // must belong to this document
    select: { id: true, title: true, content: true, createdAt: true, author: { select: { name: true } } },
  });
  if (!version) throw new HttpError(404, "Version not found.");
  return NextResponse.json(version);
});
