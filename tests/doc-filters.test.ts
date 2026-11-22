import { describe, expect, it } from "vitest";
import { filterDocs, hasActiveFilters, htmlToSearchText, parseFilters, type DocListItem } from "@/lib/doc-filters";

const now = Date.parse("2026-11-22T12:00:00Z");
const day = 24 * 60 * 60 * 1000;
const doc = (p: Partial<DocListItem>): DocListItem => ({
  id: p.title ?? "x",
  title: "Untitled",
  updatedAt: new Date(now).toISOString(),
  ownerName: "Alice Admin",
  role: null,
  shareCount: 0,
  files: [],
  text: "",
  ...p,
});

const items = [
  doc({ title: "Budget 2027", text: htmlToSearchText("<p>Quarterly <strong>forecast</strong> &amp; costs</p>") }),
  doc({ title: "Roadmap", role: "EDITOR", ownerName: "Bob Builder", files: ["plan.pdf"], updatedAt: new Date(now - 10 * day).toISOString() }),
  doc({ title: "Archive", updatedAt: new Date(now - 40 * day).toISOString() }),
];

describe("dashboard filters", () => {
  it("parses known values and ignores junk from the URL", () => {
    expect(parseFilters({ q: "  plan  ", modified: "week", owner: "shared", sort: "title" })).toEqual({
      q: "plan",
      modified: "week",
      owner: "shared",
      sort: "title",
    });
    expect(parseFilters({ modified: "decade", owner: "root", sort: "random" })).toEqual({ q: "", modified: "", owner: "", sort: "recent" });
    expect(hasActiveFilters(parseFilters({}))).toBe(false);
  });

  it("searches title, content (HTML stripped), owner and attachment names, case-insensitively", () => {
    const titles = (q: string) => filterDocs(items, parseFilters({ q }), now).map((d) => d.title);
    expect(titles("BUDGET")).toEqual(["Budget 2027"]);
    expect(titles("forecast & costs")).toEqual(["Budget 2027"]);
    expect(titles("bob")).toEqual(["Roadmap"]);
    expect(titles("plan.pdf")).toEqual(["Roadmap"]);
    expect(titles("strong")).toEqual([]); // markup isn't searchable
  });

  it("filters by owner and modification window, and sorts", () => {
    expect(filterDocs(items, parseFilters({ owner: "shared" }), now).map((d) => d.title)).toEqual(["Roadmap"]);
    expect(filterDocs(items, parseFilters({ modified: "month" }), now).map((d) => d.title)).toEqual(["Budget 2027", "Roadmap"]);
    expect(filterDocs(items, parseFilters({ sort: "title" }), now).map((d) => d.title)).toEqual(["Archive", "Budget 2027", "Roadmap"]);
    expect(filterDocs(items, parseFilters({ sort: "oldest" }), now)[0].title).toBe("Archive");
  });
});
