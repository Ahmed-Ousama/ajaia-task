import { NextResponse } from "next/server";
import { can } from "@/lib/access";
import { loadDocumentWithAccess } from "@/lib/documents";
import { forbidden, handle, requireApiUser } from "@/lib/http";
import { publish } from "@/lib/realtime";

type Ctx = { params: Promise<{ id: string }> };

/** "I'm typing" ping (throttled by the client) → others see "<name> is typing…" immediately. */
export const POST = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireApiUser();
  const { doc, access } = await loadDocumentWithAccess((await params).id, user.id);
  if (!can.edit(access)) throw forbidden();
  publish(doc.id, { type: "typing", by: { id: user.id, name: user.name } });
  return new NextResponse(null, { status: 204 });
});
