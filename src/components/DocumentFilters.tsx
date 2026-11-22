"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { MODIFIED_FILTERS, SORTS } from "@/lib/doc-filters";

/** Search box + filter dropdowns. State lives in the URL, so results are shareable and survive refresh. */
export default function DocumentFilters({ resultCount }: { resultCount: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  function onSearch(value: string) {
    setQ(value);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => update("q", value.trim()), 300);
  }

  useEffect(() => () => {
    if (debounce.current) clearTimeout(debounce.current);
  }, []);

  const active = ["q", "modified", "owner", "sort"].some((k) => params.get(k));

  const select =
    "h-10 cursor-pointer rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 shadow-sm hover:border-gray-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20";

  return (
    <div className="mb-8 space-y-3">
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          value={q}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search by title, content, owner or attachment name…"
          aria-label="Search documents"
          className="h-12 w-full rounded-full border border-gray-200 bg-white pl-11 pr-11 text-sm shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10"
        />
        {pending && <Loader2 size={16} className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Owner" className={select} value={params.get("owner") ?? ""} onChange={(e) => update("owner", e.target.value)}>
          <option value="">Owned by anyone</option>
          <option value="me">Owned by me</option>
          <option value="shared">Shared with me</option>
        </select>
        <select aria-label="Last modified" className={select} value={params.get("modified") ?? ""} onChange={(e) => update("modified", e.target.value)}>
          <option value="">Any time</option>
          {Object.entries(MODIFIED_FILTERS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <select aria-label="Sort" className={select} value={params.get("sort") ?? "recent"} onChange={(e) => update("sort", e.target.value === "recent" ? "" : e.target.value)}>
          {Object.entries(SORTS).map(([k, v]) => (
            <option key={k} value={k}>
              Sort: {v.label}
            </option>
          ))}
        </select>
        {active && (
          <>
            <span className="ml-1 text-sm text-gray-500">
              {resultCount} result{resultCount === 1 ? "" : "s"}
            </span>
            <button
              onClick={() => {
                setQ("");
                startTransition(() => router.replace(pathname, { scroll: false }));
              }}
              className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-50"
            >
              <X size={14} /> Clear filters
            </button>
          </>
        )}
      </div>
    </div>
  );
}
