/**
 * Dashboard search/filter/sort — pure functions, run in the browser on every keystroke (instant),
 * also unit-tested. The page sends every document the user can open (owned + shared) once, with a
 * plain-text excerpt of the content for full-text matching.
 */
export const MODIFIED_FILTERS = {
  today: { label: "Today", days: 1 },
  week: { label: "Last 7 days", days: 7 },
  month: { label: "Last 30 days", days: 30 },
} as const;

export const SORTS = {
  recent: { label: "Last modified" },
  oldest: { label: "Oldest first" },
  title: { label: "Title A–Z" },
} as const;

export type DocFilters = {
  q: string;
  modified: keyof typeof MODIFIED_FILTERS | "";
  owner: "me" | "shared" | "";
  sort: keyof typeof SORTS;
};

export type DocListItem = {
  id: string;
  title: string;
  updatedAt: string;
  ownerName: string;
  /** null = owned by the current user; otherwise their share role. */
  role: "VIEWER" | "EDITOR" | null;
  shareCount: number;
  files: string[];
  /** Lower-cased plain text of the content (for search). */
  text: string;
};

const pick = <T extends string>(v: unknown, allowed: readonly T[]): T | "" =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : "";

export function parseFilters(sp: Record<string, string | string[] | undefined>): DocFilters {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]);
  return {
    q: (one("q") ?? "").trim().slice(0, 100),
    modified: pick(one("modified"), Object.keys(MODIFIED_FILTERS) as (keyof typeof MODIFIED_FILTERS)[]),
    owner: pick(one("owner"), ["me", "shared"] as const),
    sort: pick(one("sort"), Object.keys(SORTS) as (keyof typeof SORTS)[]) || "recent",
  };
}

export const hasActiveFilters = (f: DocFilters) => Boolean(f.q || f.modified || f.owner || f.sort !== "recent");

/** Strips tags/entities from stored HTML → lower-cased searchable text. */
export function htmlToSearchText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 20_000);
}

export function filterDocs(items: DocListItem[], f: DocFilters, now = Date.now()): DocListItem[] {
  const q = f.q.trim().toLowerCase();
  const since = f.modified ? now - MODIFIED_FILTERS[f.modified].days * 24 * 60 * 60 * 1000 : 0;
  const out = items.filter((d) => {
    if (f.owner === "me" && d.role) return false;
    if (f.owner === "shared" && !d.role) return false;
    if (since && Date.parse(d.updatedAt) < since) return false;
    if (!q) return true;
    return (
      d.title.toLowerCase().includes(q) ||
      d.ownerName.toLowerCase().includes(q) ||
      d.files.some((n) => n.toLowerCase().includes(q)) ||
      d.text.includes(q)
    );
  });
  if (f.sort === "title") out.sort((a, b) => a.title.localeCompare(b.title));
  else if (f.sort === "oldest") out.sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt));
  else out.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  return out;
}
