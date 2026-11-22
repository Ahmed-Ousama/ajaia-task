import { randomUUID } from "node:crypto";
import { HttpError } from "@/lib/http";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "@/lib/files";
import { sha256Hex } from "@/lib/duplicates";

export type Upload = {
  filename: string;
  mimeType: string;
  size: number;
  buffer: Buffer;
  sha256: string;
  /** The user confirmed they want another copy of a file they uploaded before. */
  allowDuplicate: boolean;
};

/** Reads the single `file` field of a multipart request and enforces size + type rules. */
export async function readUpload(req: Request, isAllowed: (filename: string) => boolean, allowedLabel: string): Promise<Upload> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024) throw new HttpError(413, `File is too large (max ${MAX_UPLOAD_LABEL}).`);

  const form = await req.formData().catch(() => {
    throw new HttpError(400, "Expected a multipart form upload.");
  });
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "No file was uploaded.");
  if (file.size === 0) throw new HttpError(400, "The uploaded file is empty.");
  if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(413, `File is too large (max ${MAX_UPLOAD_LABEL}).`);
  const filename = file.name.replace(/[\\/]/g, "_").slice(0, 200) || "upload";
  if (!isAllowed(filename)) throw new HttpError(415, `Unsupported file type. Allowed: ${allowedLabel}.`);

  const buffer = Buffer.from(await file.arrayBuffer());
  return {
    filename,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    buffer,
    sha256: sha256Hex(buffer), // computed server-side; never trust a client-supplied hash
    allowDuplicate: form.get("allowDuplicate") === "true",
  };
}

export function storageKeyFor(documentId: string, filename: string) {
  const safe = filename.replace(/[^\w.\-]+/g, "_");
  return `documents/${documentId}/${randomUUID()}-${safe}`;
}
