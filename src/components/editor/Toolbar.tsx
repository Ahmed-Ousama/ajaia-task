"use client";

import type { Editor } from "@tiptap/react";
import {
  Baseline,
  Bold,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import ColorMenu, { HIGHLIGHTS, TEXT_COLORS } from "./ColorMenu";

type Btn = { icon: LucideIcon; title: string; active?: boolean; disabled?: boolean; onClick: () => void };

function ToolButton({ icon: Icon, title, active, disabled, onClick }: Btn) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} // keep the editor selection
      onClick={onClick}
      className={`grid h-8 w-8 place-items-center rounded-md transition-colors disabled:opacity-35 ${
        active ? "bg-blue-100 text-blue-700" : "text-gray-700 hover:bg-black/5"
      }`}
    >
      <Icon size={17} strokeWidth={active ? 2.5 : 2} />
    </button>
  );
}

const Divider = () => <span className="mx-1.5 h-5 w-px bg-gray-300" aria-hidden />;

export default function Toolbar({ editor }: { editor: Editor }) {
  const block = editor.isActive("heading", { level: 1 })
    ? "h1"
    : editor.isActive("heading", { level: 2 })
      ? "h2"
      : editor.isActive("heading", { level: 3 })
        ? "h3"
        : "p";

  function setBlock(v: string) {
    const chain = editor.chain().focus();
    if (v === "p") chain.setParagraph().run();
    else chain.setHeading({ level: Number(v[1]) as 1 | 2 | 3 }).run();
  }

  const c = () => editor.chain().focus();

  return (
    <div
      className="flex flex-wrap items-center gap-0.5 rounded-full bg-[#edf2fa] px-3 py-1"
      role="toolbar"
      aria-label="Formatting"
    >
      <ToolButton icon={Undo2} title="Undo (Ctrl+Z)" onClick={() => c().undo().run()} disabled={!editor.can().undo()} />
      <ToolButton icon={Redo2} title="Redo (Ctrl+Shift+Z)" onClick={() => c().redo().run()} disabled={!editor.can().redo()} />
      <Divider />
      <select
        aria-label="Text style"
        value={block}
        onChange={(e) => setBlock(e.target.value)}
        className="h-8 w-36 cursor-pointer rounded-md bg-transparent px-2 text-sm text-gray-800 hover:bg-black/5 focus:outline-none"
      >
        <option value="p">Normal text</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>
      <Divider />
      <ToolButton icon={Bold} title="Bold (Ctrl+B)" active={editor.isActive("bold")} onClick={() => c().toggleBold().run()} />
      <ToolButton icon={Italic} title="Italic (Ctrl+I)" active={editor.isActive("italic")} onClick={() => c().toggleItalic().run()} />
      <ToolButton icon={Underline} title="Underline (Ctrl+U)" active={editor.isActive("underline")} onClick={() => c().toggleUnderline().run()} />
      <ToolButton icon={Strikethrough} title="Strikethrough" active={editor.isActive("strike")} onClick={() => c().toggleStrike().run()} />
      <ColorMenu
        icon={Baseline}
        title="Text color"
        swatches={TEXT_COLORS}
        current={(editor.getAttributes("textStyle").color as string | undefined) ?? null}
        clearLabel="Default color"
        onPick={(color) => c().setColor(color).run()}
        onClear={() => c().unsetColor().run()}
      />
      <ColorMenu
        icon={Highlighter}
        title="Highlight"
        swatches={HIGHLIGHTS}
        current={editor.isActive("highlight") ? ((editor.getAttributes("highlight").color as string | undefined) ?? "#fef08a") : null}
        clearLabel="No highlight"
        onPick={(color) => c().setHighlight({ color }).run()}
        onClear={() => c().unsetHighlight().run()}
      />
      <Divider />
      <ToolButton icon={List} title="Bulleted list" active={editor.isActive("bulletList")} onClick={() => c().toggleBulletList().run()} />
      <ToolButton icon={ListOrdered} title="Numbered list" active={editor.isActive("orderedList")} onClick={() => c().toggleOrderedList().run()} />
      <ToolButton icon={Quote} title="Quote" active={editor.isActive("blockquote")} onClick={() => c().toggleBlockquote().run()} />
      <ToolButton icon={Minus} title="Divider line" onClick={() => c().setHorizontalRule().run()} />
    </div>
  );
}
