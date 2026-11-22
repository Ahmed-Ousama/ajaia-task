import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/lib/access";
import { loadDocumentWithAccess } from "@/lib/documents";
import { forbidden, handle, requireApiUser } from "@/lib/http";
import { publish } from "@/lib/realtime";

type Ctx = { params: Promise<{ id: string }> };

const pos = z.number().int().min(0).max(10_000_000);
const cursorSchema = z.object({ from: pos, to: pos });

/** Broadcasts the caller's caret/selection (ProseMirror positions) to everyone else on the document. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireApiUser();
  const { doc, access } = await loadDocumentWithAccess((await params).id, user.id);
  if (!can.edit(access)) throw forbidden();
  const { from, to } = cursorSchema.parse(await req.json().catch(() => ({})));
  publish(doc.id, { type: "cursor", by: { id: user.id, name: user.name }, from, to });
  return new NextResponse(null, { status: 204 });
});
