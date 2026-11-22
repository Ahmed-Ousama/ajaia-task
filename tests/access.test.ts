import { describe, expect, it } from "vitest";
import { can, resolveAccess, type AccessSubject } from "@/lib/access";

const doc: AccessSubject = {
  ownerId: "alice",
  shares: [
    { userId: "bob", role: "EDITOR" },
    { userId: "carol", role: "VIEWER" },
  ],
};

describe("resolveAccess", () => {
  it("gives the owner full access", () => {
    expect(resolveAccess(doc, "alice")).toBe("owner");
  });
  it("maps share roles to editor / viewer", () => {
    expect(resolveAccess(doc, "bob")).toBe("editor");
    expect(resolveAccess(doc, "carol")).toBe("viewer");
  });
  it("denies users the document was not shared with", () => {
    expect(resolveAccess(doc, "mallory")).toBeNull();
  });
});

describe("permission matrix", () => {
  const cases = [
    { access: "owner", view: true, edit: true, attachments: true, share: true, del: true },
    { access: "editor", view: true, edit: true, attachments: true, share: false, del: false },
    { access: "viewer", view: true, edit: false, attachments: false, share: false, del: false },
    { access: null, view: false, edit: false, attachments: false, share: false, del: false },
  ] as const;

  it.each(cases)("$access", ({ access, view, edit, attachments, share, del }) => {
    expect(can.view(access)).toBe(view);
    expect(can.edit(access)).toBe(edit);
    expect(can.manageAttachments(access)).toBe(attachments);
    expect(can.share(access)).toBe(share);
    expect(can.delete(access)).toBe(del);
  });
});
