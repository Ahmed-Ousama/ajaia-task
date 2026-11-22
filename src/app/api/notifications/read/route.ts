import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handle, requireApiUser } from "@/lib/http";

const bodySchema = z.object({ ids: z.array(z.string()).max(100).optional(), read: z.boolean().default(true) });

/** Marks the given notifications (or all, when `ids` is omitted) as read/unread — only the caller's own. */
export const POST = handle(async (req: Request) => {
  const user = await requireApiUser();
  const { ids, read } = bodySchema.parse(await req.json().catch(() => ({})));
  const { count } = await prisma.notification.updateMany({
    where: { userId: user.id, readAt: read ? null : { not: null }, ...(ids ? { id: { in: ids } } : {}) },
    data: { readAt: read ? new Date() : null },
  });
  return NextResponse.json({ updated: count });
});
