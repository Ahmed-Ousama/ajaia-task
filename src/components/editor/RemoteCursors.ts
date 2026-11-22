import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, Selection, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export type RemoteCursor = { id: string; name: string; color: string; from: number; to: number };

export const remoteCursorsKey = new PluginKey<RemoteCursor[]>("remoteCursors");

function caret(c: RemoteCursor) {
  const el = document.createElement("span");
  el.className = "remote-caret";
  el.style.borderColor = c.color;
  el.dataset.user = c.name;
  const label = document.createElement("span");
  label.className = "remote-caret-label";
  label.style.backgroundColor = c.color;
  label.textContent = c.name;
  el.appendChild(label);
  return el;
}

/**
 * Caret positions can arrive slightly before the text they refer to (carets are broadcast every
 * ~120 ms, content every ~1 s). A position past the end of a line would land *between* blocks and
 * render on the next line, so snap it back to the nearest real text position on the same line.
 */
function snapToText(state: EditorState, pos: number) {
  const max = state.doc.content.size;
  const $pos = state.doc.resolve(Math.max(0, Math.min(pos, max)));
  if ($pos.parent.inlineContent) return $pos.pos;
  return Selection.near($pos, -1).head;
}

/**
 * Renders collaborators' carets (coloured line + name label) and selections as decorations.
 * Positions arrive over the live stream; local edits remap them so they stay on the right text.
 * Set the full list with `tr.setMeta(remoteCursorsKey, cursors)`.
 */
export const RemoteCursors = Extension.create({
  name: "remoteCursors",
  addProseMirrorPlugins() {
    return [
      new Plugin<RemoteCursor[]>({
        key: remoteCursorsKey,
        state: {
          init: () => [],
          apply(tr, value) {
            const next = tr.getMeta(remoteCursorsKey) as RemoteCursor[] | undefined;
            if (next) return next;
            if (!tr.docChanged) return value;
            // assoc -1: text inserted exactly at someone's caret goes *after* it, so their caret
            // stays put instead of being dragged along by whoever is typing there (Google Docs behaviour).
            return value.map((c) => ({ ...c, from: tr.mapping.map(c.from, -1), to: tr.mapping.map(c.to, -1) }));
          },
        },
        props: {
          decorations(state) {
            const cursors = remoteCursorsKey.getState(state) ?? [];
            const decorations: Decoration[] = [];
            for (const c of cursors) {
              const from = snapToText(state, Math.min(c.from, c.to));
              const to = snapToText(state, Math.max(c.from, c.to));
              const head = snapToText(state, c.to);
              if (to > from) {
                decorations.push(Decoration.inline(from, to, { style: `background-color: ${c.color}2e` }));
              }
              decorations.push(Decoration.widget(head, () => caret(c), { key: `caret-${c.id}`, side: 1 }));
            }
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
