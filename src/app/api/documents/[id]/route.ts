import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { can } from "@/lib/access";
import { loadDocumentWithAccess } from "@/lib/documents";
import { deleteObject } from "@/lib/storage";
import { forbidden, handle, requireApiUser } from "@/lib/http";
import { updateDocumentSchema } from "@/lib/validation";
import { recordVersion } from "@/lib/versions";
import { publish } from "@/lib/realtime";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireApiUser();
  const { doc, access } = await loadDocumentWithAccess((await params).id, user.id);
  return NextResponse.json({
    id: doc.id,
    title: doc.title,
    content: doc.content,
    updatedAt: doc.updatedAt,
    access,
  });
});

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireApiUser();
  const { doc, access } = await loadDocumentWithAccess((await params).id, user.id);
  if (!can.edit(access)) throw forbidden("You have view-only access to this document.");
  const body = updateDocumentSchema.parse(await req.json().catch(() => ({})));
  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.document.update({
      where: { id: doc.id },
      data: { title: body.title, content: body.content, lastEditedById: user.id },
      select: { id: true, title: true, content: true, updatedAt: true },
    });
    await recordVersion(tx, doc, saved, user.id);
    return saved;
  });
  publish(doc.id, { type: "content", updatedAt: updated.updatedAt.toISOString(), by: { id: user.id, name: user.name } });
  return NextResponse.json({ id: updated.id, title: updated.title, updatedAt: updated.updatedAt });
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireApiUser();
  const { doc, access } = await loadDocumentWithAccess((await params).id, user.id);
  if (!can.delete(access)) throw forbidden("Only the owner can delete this document.");
  const attachments = await prisma.attachment.findMany({ where: { documentId: doc.id }, select: { storageKey: true } });
  await prisma.document.delete({ where: { id: doc.id } });
  // Best-effort object cleanup; DB is the source of truth.
  await Promise.allSettled(attachments.map((a) => deleteObject(a.storageKey)));
  return new NextResponse(null, { status: 204 });
});
