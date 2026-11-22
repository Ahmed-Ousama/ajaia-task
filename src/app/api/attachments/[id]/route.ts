import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { can } from "@/lib/access";
import { loadDocumentWithAccess } from "@/lib/documents";
import { forbidden, handle, HttpError, requireApiUser } from "@/lib/http";
import { deleteObject, getObjectStream } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

async function loadAttachment(id: string, userId: string) {
  const attachment = await prisma.attachment.findUnique({ where: { id } });
  if (!attachment) throw new HttpError(404, "Attachment not found.");
  // Access is inherited from the parent document (404 if the caller can't see it).
  const { access } = await loadDocumentWithAccess(attachment.documentId, userId);
  return { attachment, access };
}

/** Streams the file from private object storage after an access check. */
export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireApiUser();
  const { attachment } = await loadAttachment((await params).id, user.id);
  const stream = await getObjectStream(attachment.storageKey);
  const encoded = encodeURIComponent(attachment.filename);
  return new Response(stream, {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Length": String(attachment.size),
      "Content-Disposition": `attachment; filename="${encoded}"; filename*=UTF-8''${encoded}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireApiUser();
  const { attachment, access } = await loadAttachment((await params).id, user.id);
  if (!can.manageAttachments(access)) throw forbidden("You have view-only access to this document.");
  await prisma.attachment.delete({ where: { id: attachment.id } });
  await deleteObject(attachment.storageKey).catch((err) => console.error("object delete failed", err));
  return new NextResponse(null, { status: 204 });
});
