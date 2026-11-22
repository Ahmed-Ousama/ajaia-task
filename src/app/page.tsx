import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { htmlToSearchText, parseFilters, type DocListItem } from "@/lib/doc-filters";
import AppHeader from "@/components/AppHeader";
import NewDocumentButton from "@/components/NewDocumentButton";
import ImportButton from "@/components/ImportButton";
import DocumentBrowser from "@/components/DocumentBrowser";

export const dynamic = "force-dynamic";

const docSelect = {
  id: true,
  title: true,
  content: true,
  updatedAt: true,
  owner: { select: { name: true } },
  attachments: { select: { filename: true } },
  _count: { select: { shares: true } },
} as const;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const initial = parseFilters(await searchParams);

  // Everything the user can open, sent once; search/filter/sort then run instantly in the browser.
  const [owned, shared] = await Promise.all([
    prisma.document.findMany({ where: { ownerId: user.id }, select: docSelect }),
    prisma.documentShare.findMany({ where: { userId: user.id }, select: { role: true, document: { select: docSelect } } }),
  ]);

  type Row = (typeof owned)[number];
  const toItem = (d: Row, role: DocListItem["role"]): DocListItem => ({
    id: d.id,
    title: d.title,
    updatedAt: d.updatedAt.toISOString(),
    ownerName: d.owner.name,
    role,
    shareCount: d._count.shares,
    files: d.attachments.map((a) => a.filename),
    text: htmlToSearchText(d.content),
  });
  const items = [...owned.map((d) => toItem(d, null)), ...shared.map((s) => toItem(s.document, s.role))];

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
        <DocumentBrowser items={items} initial={initial} />
      </main>
    </>
  );
}
