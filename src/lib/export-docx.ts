import HTMLtoDOCX from "html-to-docx";

/**
 * html-to-docx understands <i> but not <em> (which is what Tiptap emits for italic), and no <mark>.
 * It has no strikethrough support at all, so struck-through text exports as plain text (documented limitation).
 */
export function normalizeForDocx(html: string): string {
  return (html || "<p></p>")
    .replace(/<(\/?)em>/g, "<$1i>")
    // Highlights: <mark data-color="#hex"> → a span with background-color, which it maps to Word shading.
    .replace(/<mark\b([^>]*)>/g, (_m, attrs: string) => {
      const color = /data-color="(#[0-9a-fA-F]{3,8})"/.exec(attrs)?.[1] ?? "#fef08a";
      return `<span style="background-color: ${color}">`;
    })
    .replace(/<\/mark>/g, "</span>");
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
