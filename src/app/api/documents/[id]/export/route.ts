import { loadDocumentWithAccess } from "@/lib/documents";
import { handle, HttpError, requireApiUser } from "@/lib/http";
import { htmlToDocx } from "@/lib/export-docx";

type Ctx = { params: Promise<{ id: string }> };

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** GET /api/documents/:id/export?format=docx — anyone who can view the document can download it. */
export const GET = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireApiUser();
  const { doc } = await loadDocumentWithAccess((await params).id, user.id);
  const format = new URL(req.url).searchParams.get("format") ?? "docx";
  if (format !== "docx") throw new HttpError(400, "Unsupported export format. Use format=docx.");

  const file = await htmlToDocx(doc.title, doc.content);
  const name = `${(doc.title.trim() || "document").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 120)}.docx`;
  const encoded = encodeURIComponent(name);
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": DOCX_MIME,
      "Content-Length": String(file.length),
      "Content-Disposition": `attachment; filename="${encoded}"; filename*=UTF-8''${encoded}`,
      "Cache-Control": "private, no-store",
    },
  });
});
