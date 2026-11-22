import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { can } from "@/lib/access";
import { loadDocumentWithAccess } from "@/lib/documents";
import { forbidden, handle, HttpError, requireApiUser } from "@/lib/http";
import { commentSelect, updateCommentSchema } from "@/lib/comments";
import { publish } from "@/lib/realtime";

type Ctx = { params: Promise<{ id: string }> };

async function loadComment(id: string, userId: string) {
  const comment = await prisma.comment.findUnique({ where: { id }, select: { id: true, documentId: true, authorId: true } });
  if (!comment) throw new HttpError(404, "Comment not found.");
  // Access is inherited from the parent document (404 if the caller can't see it).
  const { access } = await loadDocumentWithAccess(comment.documentId, userId);
  return { comment, access };
}

/** Resolve / reopen: owner or editor, or the comment's author. */
export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireApiUser();
  const { comment, access } = await loadComment((await params).id, user.id);
  if (!can.edit(access) && comment.authorId !== user.id) {
    throw forbidden("Only editors or the comment's author can resolve it.");
  }
  const { resolved } = updateCommentSchema.parse(await req.json().catch(() => ({})));
  const updated = await prisma.comment.update({
    where: { id: comment.id },
    data: { resolvedAt: resolved ? new Date() : null },
    select: commentSelect,
  });
  publish(comment.documentId, { type: "comments" });
  return NextResponse.json(updated);
});

/** Delete: the comment's author or the document owner. */
export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireApiUser();
  const { comment, access } = await loadComment((await params).id, user.id);
  if (access !== "owner" && comment.authorId !== user.id) {
    throw forbidden("Only the comment's author or the document owner can delete it.");
  }
  await prisma.comment.delete({ where: { id: comment.id } });
  publish(comment.documentId, { type: "comments" });
  return new NextResponse(null, { status: 204 });
});
