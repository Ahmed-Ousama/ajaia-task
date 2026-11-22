import { describe, expect, it } from "vitest";
import { documentOrderBy, documentWhere, hasActiveFilters, parseFilters } from "@/lib/doc-filters";

describe("dashboard filters", () => {
  it("parses known values and ignores junk from the URL", () => {
    const f = parseFilters({ q: "  plan  ", type: "pdf", modified: "week", owner: "shared", sort: "title" });
    expect(f).toEqual({ q: "plan", type: "pdf", modified: "week", owner: "shared", sort: "title" });
    expect(parseFilters({ type: "exe", modified: "decade", owner: "root", sort: "random" })).toEqual({
      q: "",
      type: "",
      modified: "",
      owner: "",
      sort: "recent",
    });
    expect(hasActiveFilters(parseFilters({}))).toBe(false);
  });

  it("builds a case-insensitive search across title, content, owner and attachment names", () => {
    const where = documentWhere(parseFilters({ q: "Budget" })) as { AND: { OR: unknown[] }[] };
    expect(where.AND[0].OR).toHaveLength(4);
    expect(JSON.stringify(where)).toContain('"mode":"insensitive"');
  });

  it("filters by attachment extension and modification window", () => {
    const now = new Date("2026-11-22T12:00:00Z");
    const where = documentWhere(parseFilters({ type: "image", modified: "week" }), now);
    const json = JSON.stringify(where);
    expect(json).toContain('".webp"');
    expect(json).toContain("2026-11-15T12:00:00.000Z");
    expect(documentOrderBy(parseFilters({ sort: "title" }))).toEqual({ title: "asc" });
  });
});
