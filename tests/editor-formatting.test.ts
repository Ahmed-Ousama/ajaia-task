// @vitest-environment happy-dom
/** Runs the real editor schema (same extension list as the app) and checks the formatting commands. */
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { editorExtensions } from "@/components/editor/extensions";

let editor: Editor | null = null;
afterEach(() => editor?.destroy());

const make = (content: string) => (editor = new Editor({ extensions: editorExtensions(), content }));

describe("editor formatting", () => {
  it("applies text colour and highlight to the selection", () => {
    const e = make("<p>hello world</p>");
    e.chain().setTextSelection({ from: 1, to: 6 }).setColor("#dc2626").run();
    e.chain().setTextSelection({ from: 7, to: 12 }).setHighlight({ color: "#fef08a" }).run();
    const html = e.getHTML();
    expect(html).toContain('<span style="color: #dc2626;">hello</span>');
    expect(html).toMatch(/<mark data-color="#fef08a" style="background-color: #fef08a; color: inherit;?">world<\/mark>/);
  });

  it("removes colour and highlight", () => {
    const e = make('<p><span style="color: #dc2626">a</span> <mark data-color="#fef08a">b</mark></p>');
    e.chain().selectAll().unsetColor().unsetHighlight().run();
    expect(e.getHTML()).toBe("<p>a b</p>");
  });

  it("keeps the core formatting the brief asks for", () => {
    const e = make("<p>x</p>");
    e.chain().selectAll().toggleBold().toggleItalic().toggleUnderline().run();
    expect(e.getHTML()).toBe("<p><strong><em><u>x</u></em></strong></p>");
    e.chain().setHeading({ level: 2 }).run();
    expect(e.getHTML()).toMatch(/^<h2>/);
    e.chain().setParagraph().toggleBulletList().run();
    expect(e.getHTML()).toMatch(/^<ul><li>/);
  });
});
