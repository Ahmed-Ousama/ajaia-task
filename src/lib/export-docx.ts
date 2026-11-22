import HTMLtoDOCX from "html-to-docx";

/**
 * html-to-docx understands <i> but not <em> (which is what Tiptap emits for italic).
 * It has no strikethrough support at all, so struck-through text exports as plain text (documented limitation).
 */
export function normalizeForDocx(html: string): string {
  return (html || "<p></p>").replace(/<(\/?)em>/g, "<$1i>");
}

/** Converts the stored (Tiptap) HTML into a .docx file. Runs server-side only. */
export async function htmlToDocx(title: string, html: string): Promise<Buffer> {
  const out = await HTMLtoDOCX(normalizeForDocx(html), null, {
    title,
    creator: "Ajaia Docs",
    font: "Calibri",
    fontSize: 22, // half-points → 11pt
    table: { row: { cantSplit: true } },
    footer: false,
    pageNumber: false,
  });
  return Buffer.isBuffer(out) ? out : Buffer.from(await (out as Blob).arrayBuffer());
}
