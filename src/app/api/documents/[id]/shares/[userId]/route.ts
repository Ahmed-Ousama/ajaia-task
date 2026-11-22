import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { can } from "@/lib/access";
import { loadDocumentWithAccess } from "@/lib/documents";
import { forbidden, handle, requireApiUser } from "@/lib/http";

type Ctx = { params: Promise<{ id: string; userId: string }> };

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireApiUser();
  const { id, userId } = await params;
  const { doc, access } = await loadDocumentWithAccess(id, user.id);
  if (!can.share(access)) throw forbidden("Only the owner can manage sharing.");
  await prisma.$transaction([
    prisma.documentShare.deleteMany({ where: { documentId: doc.id, userId } }),
    // Their notifications about this document would now lead to a 404 — remove them.
    prisma.notification.deleteMany({ where: { documentId: doc.id, userId } }),
  ]);
  return new NextResponse(null, { status: 204 });
});
