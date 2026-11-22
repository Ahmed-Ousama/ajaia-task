import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";

/** Single source of truth for the document schema (editor, read-only previews, exports). */
export function editorExtensions(placeholder = "") {
  return [
    StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
    Underline,
    TextStyle, // carrier mark for inline styles (required by Color)
    Color,
    Highlight.configure({ multicolor: true }),
    ...(placeholder ? [Placeholder.configure({ placeholder })] : []),
  ];
}
