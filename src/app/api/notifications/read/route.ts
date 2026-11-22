import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handle, requireApiUser } from "@/lib/http";

const bodySchema = z.object({ ids: z.array(z.string()).max(100).optional() });

/** Marks the given notifications (or all, when `ids` is omitted) as read — only the caller's own. */
export const POST = handle(async (req: Request) => {
  const user = await requireApiUser();
  const { ids } = bodySchema.parse(await req.json().catch(() => ({})));
  const { count } = await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() },
  });
  return NextResponse.json({ updated: count });
});
