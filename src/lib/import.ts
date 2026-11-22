import mammoth from "mammoth";
import { Marked } from "marked";
import { extensionOf } from "@/lib/files";

export class UnsupportedFileError extends Error {}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Plain text: blank lines separate paragraphs, single newlines become <br>. */
export function textToHtml(text: string): string {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return "<p></p>";
  return normalized
    .split(/\n{2,}/)
    .map((para) => `<p>${para.split("\n").map(escapeHtml).join("<br>")}</p>`)
    .join("");
}

// Raw HTML embedded in markdown is shown as text instead of being passed through.
const markdown = new Marked({
  gfm: true,
  async: false,
  renderer: { html: ({ text }) => escapeHtml(text) },
});

export function markdownToHtml(md: string): string {
  const html = markdown.parse(md.replace(/\r\n?/g, "\n")) as string;
  return html.trim() || "<p></p>";
}

export async function docxToHtml(buffer: Buffer): Promise<string> {
  const { value } = await mammoth.convertToHtml({ buffer });
  return value.trim() || "<p></p>";
}

export function titleFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return (base || "Imported document").slice(0, 200);
}

/**
 * Converts an uploaded file into HTML the editor can load. The editor's schema
 * (Tiptap/ProseMirror) drops any markup it doesn't support when the document is opened.
 */
export async function convertFileToHtml(filename: string, buffer: Buffer): Promise<{ title: string; html: string }> {
  const ext = extensionOf(filename);
  const title = titleFromFilename(filename);
  switch (ext) {
    case ".txt":
      return { title, html: textToHtml(buffer.toString("utf8")) };
    case ".md":
    case ".markdown":
      return { title, html: markdownToHtml(buffer.toString("utf8")) };
    case ".docx":
      return { title, html: await docxToHtml(buffer) };
    default:
      throw new UnsupportedFileError(`Unsupported file type "${ext || filename}". Use .txt, .md or .docx.`);
  }
}
