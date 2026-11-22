import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { loadDocumentWithAccess } from "@/lib/documents";
import { handle, requireApiUser } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

/** A viewer counts as "here" if their heartbeat is newer than this. */
const ACTIVE_WINDOW_MS = 30_000;

/**
 * Heartbeat (client sends every ~10 s while the document is open).
 * Returns who else is here and when/by whom the document was last saved, so the client can
 * show presence avatars and offer to load changes made by someone else.
 */
export const POST = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireApiUser();
  const { doc } = await loadDocumentWithAccess((await params).id, user.id);
  const now = new Date();

  await prisma.documentPresence.upsert({
    where: { documentId_userId: { documentId: doc.id, userId: user.id } },
    update: { lastSeenAt: now },
    create: { documentId: doc.id, userId: user.id, lastSeenAt: now },
  });

  const [active, latest] = await Promise.all([
    prisma.documentPresence.findMany({
      where: { documentId: doc.id, userId: { not: user.id }, lastSeenAt: { gt: new Date(now.getTime() - ACTIVE_WINDOW_MS) } },
      select: { user: { select: { id: true, name: true } } },
      orderBy: { lastSeenAt: "desc" },
    }),
    prisma.document.findUnique({
      where: { id: doc.id },
      select: { updatedAt: true, lastEditedBy: { select: { id: true, name: true } } },
    }),
  ]);

  return NextResponse.json({
    active: active.map((p) => p.user),
    updatedAt: latest?.updatedAt,
    lastEditedBy: latest?.lastEditedBy ?? null,
  });
});

/** Leaving the document (sent with keepalive on unmount/page hide). */
export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireApiUser();
  await prisma.documentPresence.deleteMany({ where: { documentId: (await params).id, userId: user.id } });
  return new NextResponse(null, { status: 204 });
});
