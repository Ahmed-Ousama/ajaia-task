import { describe, expect, it } from "vitest";
import { convertFileToHtml, markdownToHtml, textToHtml, titleFromFilename } from "@/lib/import";
import { isAttachable, isImportable } from "@/lib/files";

describe("text import", () => {
  it("turns blank-line separated blocks into paragraphs and keeps line breaks", () => {
    expect(textToHtml("Hello\nworld\n\nSecond para")).toBe("<p>Hello<br>world</p><p>Second para</p>");
  });
  it("escapes HTML so text is never interpreted as markup", () => {
    expect(textToHtml("<script>alert(1)</script>")).toBe("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
  });
  it("produces an empty paragraph for empty files", () => {
    expect(textToHtml("  \n ")).toBe("<p></p>");
  });
});

describe("markdown import", () => {
  it("preserves headings, emphasis and lists", () => {
    const html = markdownToHtml("# Title\n\nSome **bold** and *italic*.\n\n- one\n- two\n\n1. first");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toMatch(/<ul>\s*<li>one<\/li>\s*<li>two<\/li>\s*<\/ul>/);
    expect(html).toMatch(/<ol>\s*<li>first<\/li>\s*<\/ol>/);
  });
  it("escapes raw HTML embedded in markdown", () => {
    const html = markdownToHtml('<img src=x onerror="alert(1)">\n\ntext');
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});

describe("convertFileToHtml", () => {
  it("derives the document title from the file name", async () => {
    const out = await convertFileToHtml("meeting_notes-2026.md", Buffer.from("# Hi"));
    expect(out.title).toBe("meeting notes 2026");
    expect(out.html).toContain("<h1>Hi</h1>");
  });
  it("rejects unsupported file types", async () => {
    await expect(convertFileToHtml("virus.exe", Buffer.from("x"))).rejects.toThrow(/Unsupported/);
  });
  it("falls back to a default title", () => {
    expect(titleFromFilename(".txt")).toBe("Imported document");
  });
});

describe("upload allow-lists", () => {
  it("only imports text-like documents", () => {
    expect(isImportable("a.DOCX")).toBe(true);
    expect(isImportable("a.pdf")).toBe(false);
  });
  it("accepts common attachment types and rejects executables", () => {
    expect(isAttachable("report.pdf")).toBe(true);
    expect(isAttachable("setup.exe")).toBe(false);
    expect(isAttachable("noextension")).toBe(false);
  });
});
