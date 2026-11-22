"use client";

import TurndownService from "turndown";

function safeFilename(title: string) {
  return (title.trim() || "document").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 120);
}

/** HTML (Tiptap output) → GitHub-flavoured Markdown. Underline has no Markdown syntax, so it's kept as <u>. */
export function htmlToMarkdown(html: string): string {
  const td = new TurndownService({ headingStyle: "atx", bulletListMarker: "-", codeBlockStyle: "fenced", hr: "---" });
  td.keep(["u"]);
  td.addRule("strikethrough", {
    filter: ["s", "del"],
    replacement: (content) => `~~${content}~~`,
  });
  return td.turndown(html).trim() + "\n";
}

export function downloadMarkdown(title: string, html: string) {
  const md = `# ${title.trim() || "Untitled document"}\n\n${htmlToMarkdown(html)}`;
  const url = URL.createObjectURL(new Blob([md], { type: "text/markdown;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `${safeFilename(title)}.md` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Uses the browser's print dialog ("Save as PDF"); print CSS limits output to the document. */
export function printToPdf(title: string) {
  const previous = document.title;
  document.title = safeFilename(title); // browsers use this as the default PDF filename
  window.addEventListener("afterprint", () => (document.title = previous), { once: true });
  window.print();
}
