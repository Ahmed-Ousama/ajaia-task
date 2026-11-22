"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileText, Paperclip, Search, SearchX, Users, X } from "lucide-react";
import { formatDate } from "@/lib/format";
import {
  MODIFIED_FILTERS,
  SORTS,
  filterDocs,
  hasActiveFilters,
  type DocFilters,
  type DocListItem,
} from "@/lib/doc-filters";

/** Search + filters + the two document lists. Filtering is instant (client-side); the URL mirrors the state. */
export default function DocumentBrowser({ items, initial }: { items: DocListItem[]; initial: DocFilters }) {
  const [f, setF] = useState<DocFilters>(initial);
  const set = <K extends keyof DocFilters>(k: K, v: DocFilters[K]) => setF((prev) => ({ ...prev, [k]: v }));

  // Keep the URL shareable/refresh-safe without a server round trip.
  useEffect(() => {
    const params = new URLSearchParams();
    if (f.q) params.set("q", f.q);
    if (f.owner) params.set("owner", f.owner);
    if (f.modified) params.set("modified", f.modified);
    if (f.sort !== "recent") params.set("sort", f.sort);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [f]);

  const results = useMemo(() => filterDocs(items, f), [items, f]);
  const owned = results.filter((d) => !d.role);
  const shared = results.filter((d) => d.role);
  const filtered = hasActiveFilters(f);

  const select =
    "h-10 cursor-pointer rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 shadow-sm hover:border-gray-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20";
  const listClass = "divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm";
  const rowClass = "flex items-center gap-3 px-4 py-3 transition-colors hover:bg-blue-50/40";

  return (
    <>
      <div className="mb-8 space-y-3">
        <div className="relative">
          <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={f.q}
            onChange={(e) => set("q", e.target.value)}
            placeholder="Search by title, content, owner or attachment name…"
            aria-label="Search documents"
            className="h-12 w-full rounded-full border border-gray-200 bg-white pl-11 pr-4 text-sm shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Owner" className={select} value={f.owner} onChange={(e) => set("owner", e.target.value as DocFilters["owner"])}>
            <option value="">Owned by anyone</option>
            <option value="me">Owned by me</option>
            <option value="shared">Shared with me</option>
          </select>
          <select aria-label="Last modified" className={select} value={f.modified} onChange={(e) => set("modified", e.target.value as DocFilters["modified"])}>
            <option value="">Any time</option>
            {Object.entries(MODIFIED_FILTERS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <select aria-label="Sort" className={select} value={f.sort} onChange={(e) => set("sort", e.target.value as DocFilters["sort"])}>
            {Object.entries(SORTS).map(([k, v]) => (
              <option key={k} value={k}>
                Sort: {v.label}
              </option>
            ))}
          </select>
          {filtered && (
            <>
              <span className="ml-1 text-sm text-gray-500">
                {results.length} result{results.length === 1 ? "" : "s"}
              </span>
              <button
                onClick={() => setF({ q: "", owner: "", modified: "", sort: "recent" })}
                className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-50"
              >
                <X size={14} /> Clear filters
              </button>
            </>
          )}
        </div>
      </div>

      {f.owner !== "shared" && (
        <section className="mb-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            My documents <span className="text-gray-400">({owned.length})</span>
          </h2>
          {owned.length === 0 ? (
            <Empty filtered={filtered}>You don&apos;t own any documents yet. Create one or import a file to get started.</Empty>
          ) : (
            <ul className={listClass}>
              {owned.map((d) => (
                <li key={d.id}>
                  <Link href={`/documents/${d.id}`} className={rowClass}>
                    <DocIcon />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-gray-900">{d.title}</div>
                      <div className="text-xs text-gray-500">Edited {formatDate(d.updatedAt)}</div>
                    </div>
                    <FileChips files={d.files} />
                    {d.shareCount > 0 && (
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">Shared with {d.shareCount}</span>
                    )}
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">Owner</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {f.owner !== "me" && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Shared with me <span className="text-gray-400">({shared.length})</span>
          </h2>
          {shared.length === 0 ? (
            <Empty filtered={filtered}>Nothing has been shared with you yet.</Empty>
          ) : (
            <ul className={listClass}>
              {shared.map((d) => (
                <li key={d.id}>
                  <Link href={`/documents/${d.id}`} className={rowClass}>
                    <DocIcon shared />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-gray-900">{d.title}</div>
                      <div className="text-xs text-gray-500">
                        Owned by {d.ownerName} · Edited {formatDate(d.updatedAt)}
                      </div>
                    </div>
                    <FileChips files={d.files} />
                    {d.role === "EDITOR" ? (
                      <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">Can edit</span>
                    ) : (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">View only</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}

function DocIcon({ shared }: { shared?: boolean }) {
  return (
    <span
      className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${shared ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600"}`}
      aria-hidden
    >
      {shared ? <Users size={18} /> : <FileText size={18} />}
    </span>
  );
}

function FileChips({ files }: { files: string[] }) {
  if (!files.length) return null;
  const exts = [...new Set(files.map((f) => f.split(".").pop()!.toUpperCase()))].slice(0, 3);
  return (
    <span className="hidden items-center gap-1 sm:flex" title={`${files.length} attachment${files.length === 1 ? "" : "s"}`}>
      <Paperclip size={13} className="text-gray-400" />
      {exts.map((e) => (
        <span key={e} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">
          {e}
        </span>
      ))}
    </span>
  );
}

function Empty({ filtered, children }: { filtered: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-500">
      {filtered && <SearchX size={18} className="text-gray-400" />}
      {filtered ? "No documents match your search or filters." : children}
    </div>
  );
}
