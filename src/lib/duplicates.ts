import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/http";

export function sha256Hex(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/** "report.pdf", 2 → "report (2).pdf"; "README", 3 → "README (3)". n <= 1 returns the name unchanged. */
export function numberedFilename(filename: string, n: number): string {
  if (n <= 1) return filename;
  const dot = filename.lastIndexOf(".");
  if (dot <= 0) return `${filename} (${n})`;
  return `${filename.slice(0, dot)} (${n})${filename.slice(dot)}`;
}

export type DuplicateInfo = {
  filename: string;
  uploadedAt: string;
  documentId: string;
  documentTitle: string;
};

/**
 * Has *this user* already uploaded a file with these exact bytes?
 * Scoped to the uploader and to documents they can still open — never reveals other users' files.
 * Returns the most recent match plus how many copies exist (for numbering the next one).
 */
export async function findDuplicateForUser(userId: string, sha256: string) {
  const where = {
    uploadedById: userId,
    sha256,
    document: { OR: [{ ownerId: userId }, { shares: { some: { userId } } }] },
  };
  const [latest, copies] = await Promise.all([
    prisma.attachment.findFirst({
      where,
      orderBy: { createdAt: "desc" },
      select: { filename: true, createdAt: true, document: { select: { id: true, title: true } } },
    }),
    prisma.attachment.count({ where }),
  ]);
  if (!latest) return null;
  const info: DuplicateInfo = {
    filename: latest.filename,
    uploadedAt: latest.createdAt.toISOString(),
    documentId: latest.document.id,
    documentTitle: latest.document.title,
  };
  return { info, copies };
}

/**
 * Enforces the duplicate rule for an upload: throws 409 (with details for the confirmation
 * popup) unless the user explicitly confirmed; returns the copy number to use for naming.
 */
export async function checkDuplicate(userId: string, sha256: string, allowDuplicate: boolean): Promise<number> {
  const dup = await findDuplicateForUser(userId, sha256);
  if (!dup) return 1;
  if (!allowDuplicate) {
    throw new HttpError(409, "You've already uploaded this file.", { code: "DUPLICATE_FILE", duplicate: dup.info });
  }
  return dup.copies + 1;
}
