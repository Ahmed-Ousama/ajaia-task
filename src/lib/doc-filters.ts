import type { Prisma } from "@prisma/client";

/** Dashboard search/filter options (URL query params). Shared by the server query and the filter UI. */
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

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

export function parseFilters(sp: Record<string, string | string[] | undefined>): DocFilters {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]);
  return {
    q: (one("q") ?? "").trim().slice(0, 100),
    modified: pick(one("modified"), Object.keys(MODIFIED_FILTERS) as (keyof typeof MODIFIED_FILTERS)[], "" as never) || "",
    owner: pick(one("owner"), ["me", "shared"] as const, "" as never) || "",
    sort: pick(one("sort"), Object.keys(SORTS) as (keyof typeof SORTS)[], "recent"),
  };
}

export const hasActiveFilters = (f: DocFilters) => Boolean(f.q || f.modified || f.owner || f.sort !== "recent");

/** Prisma `where` for documents matching the filters (access scoping is added by the caller). */
export function documentWhere(f: DocFilters, now = new Date()): Prisma.DocumentWhereInput {
  const and: Prisma.DocumentWhereInput[] = [];
  if (f.q) {
    and.push({
      OR: [
        { title: { contains: f.q, mode: "insensitive" } },
        { content: { contains: f.q, mode: "insensitive" } },
        { owner: { name: { contains: f.q, mode: "insensitive" } } },
        { attachments: { some: { filename: { contains: f.q, mode: "insensitive" } } } },
      ],
    });
  }
  if (f.modified) {
    const since = new Date(now.getTime() - MODIFIED_FILTERS[f.modified].days * 24 * 60 * 60 * 1000);
    and.push({ updatedAt: { gte: since } });
  }
  return and.length ? { AND: and } : {};
}

export function documentOrderBy(f: DocFilters): Prisma.DocumentOrderByWithRelationInput {
  if (f.sort === "title") return { title: "asc" };
  if (f.sort === "oldest") return { updatedAt: "asc" };
  return { updatedAt: "desc" };
}
