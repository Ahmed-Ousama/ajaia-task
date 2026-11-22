import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { resolveAccess } from "@/lib/access";
import { attachmentSelect } from "@/lib/documents";
import DocumentEditor from "@/components/editor/DocumentEditor";

export const dynamic = "force-dynamic";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const doc = await prisma.document.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      shares: { select: { role: true, userId: true, user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "asc" } },
      attachments: { select: attachmentSelect, orderBy: { createdAt: "desc" } },
    },
  });
  const access = doc ? resolveAccess(doc, user.id) : null;
  if (!doc || !access) notFound(); // same response for "missing" and "not yours"

  return (
    <>
      <DocumentEditor
        currentUser={user}
        doc={{
          id: doc.id,
          title: doc.title,
          content: doc.content,
          updatedAt: doc.updatedAt.toISOString(),
          access,
          owner: doc.owner,
        }}
        // Only the owner manages sharing, so only the owner receives the share list.
        initialShares={access === "owner" ? doc.shares.map((s) => ({ role: s.role, user: s.user })) : []}
        initialAttachments={doc.attachments.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() }))}
      />
    </>
  );
}
