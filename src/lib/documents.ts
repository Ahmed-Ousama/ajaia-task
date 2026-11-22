import { prisma } from "@/lib/db";
import { resolveAccess, type Access } from "@/lib/access";
import { notFound } from "@/lib/http";

/** Loads a document and the caller's access level; throws 404 when the caller has no access. */
export async function loadDocumentWithAccess(documentId: string, userId: string) {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: { shares: { select: { userId: true, role: true } } },
  });
  const access: Access | null = doc ? resolveAccess(doc, userId) : null;
  if (!doc || !access) throw notFound();
  return { doc, access };
}

/** Attachment fields exposed to clients (never the storage key). */
export const attachmentSelect = {
  id: true,
  filename: true,
  mimeType: true,
  size: true,
  createdAt: true,
  uploadedBy: { select: { name: true } },
} as const;
