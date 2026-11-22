/** Upload rules shared by the API (enforcement) and the UI (hints). No server-only imports here. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB (Caddy rejects bodies > 6 MB)
export const MAX_UPLOAD_LABEL = "5 MB";

/** Files that can be converted into a new editable document. */
export const IMPORT_EXTENSIONS = [".txt", ".md", ".markdown", ".docx"] as const;

/** Files that can be attached to a document (stored as-is in object storage). */
export const ATTACHMENT_EXTENSIONS = [
  ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp",
  ".txt", ".md", ".csv", ".docx", ".xlsx", ".pptx",
] as const;

export function extensionOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i === -1 ? "" : filename.slice(i).toLowerCase();
}

export function isImportable(filename: string) {
  return (IMPORT_EXTENSIONS as readonly string[]).includes(extensionOf(filename));
}

export function isAttachable(filename: string) {
  return (ATTACHMENT_EXTENSIONS as readonly string[]).includes(extensionOf(filename));
}
