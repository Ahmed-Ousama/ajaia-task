import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { loadDocumentWithAccess } from "@/lib/documents";
import { handle, requireApiUser } from "@/lib/http";
import { commentSelect, createCommentSchema } from "@/lib/comments";
import { publish, publishToUser } from "@/lib/realtime";

type Ctx = { params: Promise<{ id: string }> };

/** Anyone who can open the document can read its comments. */
export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireApiUser();
  const { doc } = await loadDocumentWithAccess((await params).id, user.id);
  const comments = await prisma.comment.findMany({
    where: { documentId: doc.id },
    orderBy: { createdAt: "asc" },
    select: commentSelect,
  });
  return NextResponse.json(comments);
});

/** Anyone with access (including viewers, like Google Docs "commenters") can comment. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireApiUser();
  const { doc } = await loadDocumentWithAccess((await params).id, user.id);
  const { body, quote } = createCommentSchema.parse(await req.json().catch(() => ({})));
  // Everyone else with access to the document hears about the new comment.
  const recipients = [...new Set([doc.ownerId, ...doc.shares.map((s) => s.userId)])].filter((id) => id !== user.id);
  const comment = await prisma.$transaction(async (tx) => {
    const created = await tx.comment.create({
      data: { documentId: doc.id, authorId: user.id, body, quote },
      select: commentSelect,
    });
    if (recipients.length) {
      await tx.notification.createMany({
        data: recipients.map((userId) => ({
          type: "COMMENT_ADDED" as const,
          userId,
          actorId: user.id,
          documentId: doc.id,
          excerpt: body.length > 140 ? `${body.slice(0, 137)}…` : body,
        })),
      });
    }
    return created;
  });
  publish(doc.id, { type: "comments" });
  recipients.forEach(publishToUser);
  return NextResponse.json(comment, { status: 201 });
});
