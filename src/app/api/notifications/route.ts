import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handle, requireApiUser } from "@/lib/http";

/** Latest notifications for the signed-in user + unread count (polled by the header bell). */
export const GET = handle(async () => {
  const user = await requireApiUser();
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        type: true,
        role: true,
        excerpt: true,
        readAt: true,
        createdAt: true,
        actor: { select: { name: true } },
        document: { select: { id: true, title: true } },
      },
    }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  return NextResponse.json({ unread, items });
});
