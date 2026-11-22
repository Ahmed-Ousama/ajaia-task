import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handle, requireApiUser } from "@/lib/http";

/**
 * Workspace directory for the share picker: everyone except the caller (name + email only).
 * Fine for a single internal workspace; a multi-tenant app would scope this to the caller's org.
 */
export const GET = handle(async () => {
  const user = await requireApiUser();
  const users = await prisma.user.findMany({
    where: { id: { not: user.id } },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
    take: 200,
  });
  return NextResponse.json(users);
});
