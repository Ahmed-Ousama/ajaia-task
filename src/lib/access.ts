/**
 * Document access rules — pure functions so they can be unit-tested without a DB.
 *
 *   owner  : everything (edit, rename, share, delete, manage attachments)
 *   editor : edit content/title, upload & delete attachments
 *   viewer : read the document and download attachments
 *   null   : no access (APIs respond 404 so document ids are not leaked)
 */
export type ShareRole = "VIEWER" | "EDITOR";
export type Access = "owner" | "editor" | "viewer";

export type AccessSubject = {
  ownerId: string;
  shares: ReadonlyArray<{ userId: string; role: ShareRole }>;
};

export function resolveAccess(doc: AccessSubject, userId: string): Access | null {
  if (doc.ownerId === userId) return "owner";
  const share = doc.shares.find((s) => s.userId === userId);
  if (!share) return null;
  return share.role === "EDITOR" ? "editor" : "viewer";
}

export const can = {
  view: (a: Access | null): a is Access => a !== null,
  edit: (a: Access | null) => a === "owner" || a === "editor",
  manageAttachments: (a: Access | null) => a === "owner" || a === "editor",
  share: (a: Access | null) => a === "owner",
  delete: (a: Access | null) => a === "owner",
};
