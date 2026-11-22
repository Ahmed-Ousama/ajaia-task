import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { loadDocumentWithAccess } from "@/lib/documents";
import { handle, requireApiUser } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

/** Version list (newest first, no content). Anyone with access to the document can see it. */
export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireApiUser();
  const { doc } = await loadDocumentWithAccess((await params).id, user.id);
  const versions = await prisma.documentVersion.findMany({
    where: { documentId: doc.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, title: true, createdAt: true, author: { select: { name: true } } },
  });
  return NextResponse.json(versions);
});
