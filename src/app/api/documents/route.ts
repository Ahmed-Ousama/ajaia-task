import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handle, requireApiUser } from "@/lib/http";
import { createDocumentSchema } from "@/lib/validation";

export const POST = handle(async (req: Request) => {
  const user = await requireApiUser();
  const body = createDocumentSchema.parse(await req.json().catch(() => ({})));
  const doc = await prisma.document.create({
    data: { title: body.title ?? "Untitled document", ownerId: user.id },
    select: { id: true },
  });
  return NextResponse.json(doc, { status: 201 });
});
