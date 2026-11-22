import { api, ApiError } from "@/lib/api-client";

export type DuplicateInfo = {
  filename: string;
  uploadedAt: string;
  documentId: string;
  documentTitle: string;
};

export type UploadResult<T> = { ok: true; data: T } | { ok: false; duplicate: DuplicateInfo };

/**
 * POSTs a file as multipart. If the server reports the user already uploaded the same bytes
 * (409 DUPLICATE_FILE), resolves with the duplicate details so the UI can ask for confirmation;
 * call again with `allowDuplicate: true` to store a numbered copy.
 */
export async function uploadFile<T>(url: string, file: File, allowDuplicate = false): Promise<UploadResult<T>> {
  const body = new FormData();
  body.append("file", file);
  if (allowDuplicate) body.append("allowDuplicate", "true");
  try {
    return { ok: true, data: await api<T>(url, { method: "POST", body }) };
  } catch (e) {
    if (e instanceof ApiError && e.status === 409 && e.data.code === "DUPLICATE_FILE") {
      return { ok: false, duplicate: e.data.duplicate as DuplicateInfo };
    }
    throw e;
  }
}
