import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { can } from "@/lib/access";
import { loadDocumentWithAccess } from "@/lib/documents";
import { forbidden, handle, HttpError, requireApiUser } from "@/lib/http";
import { shareSchema } from "@/lib/validation";
import { publishToUser } from "@/lib/realtime";

type Ctx = { params: Promise<{ id: string }> };

const shareSelect = {
  role: true,
  user: { select: { id: true, email: true, name: true } },
} as const;

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireApiUser();
  const { doc, access } = await loadDocumentWithAccess((await params).id, user.id);
  if (!can.share(access)) throw forbidden("Only the owner can manage sharing.");
  const shares = await prisma.documentShare.findMany({
    where: { documentId: doc.id },
    select: shareSelect,
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(shares);
});

/** Grant (or update) access for a user identified by email. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireApiUser();
  const { doc, access } = await loadDocumentWithAccess((await params).id, user.id);
  if (!can.share(access)) throw forbidden("Only the owner can share this document.");
  const { email, role } = shareSchema.parse(await req.json().catch(() => ({})));

  const target = await prisma.user.findUnique({ where: { email } });
  if (!target) throw new HttpError(404, `No user with email ${email}. Ask them to sign in once first.`);
  if (target.id === doc.ownerId) throw new HttpError(400, "You already own this document.");

  const where = { documentId_userId: { documentId: doc.id, userId: target.id } };
  const share = await prisma.$transaction(async (tx) => {
    const existing = await tx.documentShare.findUnique({ where, select: { role: true } });
    const saved = await tx.documentShare.upsert({
      where,
      update: { role },
      create: { documentId: doc.id, userId: target.id, role },
      select: shareSelect,
    });
    // Notify the recipient on a new share or a role change (not on a no-op re-share).
    if (!existing || existing.role !== role) {
      await tx.notification.create({
        data: {
          type: existing ? "SHARE_ROLE_CHANGED" : "DOCUMENT_SHARED",
          role,
          userId: target.id,
          actorId: user.id,
          documentId: doc.id,
        },
      });
    }
    return saved;
  });
  publishToUser(target.id); // bell updates instantly
  return NextResponse.json(share, { status: 201 });
});
