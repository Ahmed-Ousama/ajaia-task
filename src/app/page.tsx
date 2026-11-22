import Link from "next/link";
import { FileText, Paperclip, SearchX, Users } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { formatDate } from "@/lib/format";
import { documentOrderBy, documentWhere, hasActiveFilters, parseFilters } from "@/lib/doc-filters";
import AppHeader from "@/components/AppHeader";
import NewDocumentButton from "@/components/NewDocumentButton";
import ImportButton from "@/components/ImportButton";
import DocumentFilters from "@/components/DocumentFilters";

export const dynamic = "force-dynamic";

const listSelect = {
  id: true,
  title: true,
  updatedAt: true,
  owner: { select: { name: true } },
  attachments: { select: { filename: true } },
  _count: { select: { shares: true } },
} as const;

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

function RoleBadge({ role }: { role: "VIEWER" | "EDITOR" }) {
  return role === "EDITOR" ? (
    <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">Can edit</span>
  ) : (
    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">View only</span>
  );
}

/** Small chips for the kinds of files attached (e.g. PDF · DOCX), so type filters are self-explanatory. */
function FileChips({ files }: { files: { filename: string }[] }) {
  if (!files.length) return null;
  const exts = [...new Set(files.map((f) => f.filename.split(".").pop()!.toUpperCase()))].slice(0, 3);
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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const filters = parseFilters(await searchParams);
  const filtered = hasActiveFilters(filters);
  const where = documentWhere(filters);
  const orderBy = documentOrderBy(filters);

  const [owned, shared] = await Promise.all([
    filters.owner === "shared"
      ? Promise.resolve([])
      : prisma.document.findMany({ where: { AND: [{ ownerId: user.id }, where] }, orderBy, select: listSelect }),
    filters.owner === "me"
      ? Promise.resolve([])
      : prisma.documentShare.findMany({
          where: { userId: user.id, document: where },
          orderBy: { document: orderBy },
          select: { role: true, document: { select: listSelect } },
        }),
  ]);

  const rowClass = "flex items-center gap-3 px-4 py-3 transition-colors hover:bg-blue-50/40";
  const listClass = "divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm";

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <section className="mb-10">
          <h1 className="mb-4 text-base font-medium text-gray-800">Start a new document</h1>
          <div className="flex flex-wrap items-start gap-4">
            <NewDocumentButton />
            <ImportButton />
          </div>
        </section>

        <DocumentFilters resultCount={owned.length + shared.length} />

        {filters.owner !== "shared" && (
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
                      <FileChips files={d.attachments} />
                      {d._count.shares > 0 && (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                          Shared with {d._count.shares}
                        </span>
                      )}
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">Owner</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {filters.owner !== "me" && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Shared with me <span className="text-gray-400">({shared.length})</span>
            </h2>
            {shared.length === 0 ? (
              <Empty filtered={filtered}>Nothing has been shared with you yet.</Empty>
            ) : (
              <ul className={listClass}>
                {shared.map(({ role, document: d }) => (
                  <li key={d.id}>
                    <Link href={`/documents/${d.id}`} className={rowClass}>
                      <DocIcon shared />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-gray-900">{d.title}</div>
                        <div className="text-xs text-gray-500">
                          Owned by {d.owner.name} · Edited {formatDate(d.updatedAt)}
                        </div>
                      </div>
                      <FileChips files={d.attachments} />
                      <RoleBadge role={role} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
    </>
  );
}
