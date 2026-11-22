/**
 * Integration tests for duplicate-upload detection (real Postgres + MinIO) and share notifications.
 * Only the session lookup is mocked. Requires `docker compose up -d db minio`.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/session";
import { numberedFilename } from "@/lib/duplicates";

let currentUser: CurrentUser | null = null;
vi.mock("@/lib/session", () => ({
  getCurrentUser: async () => currentUser,
  requireUser: async () => currentUser,
}));

const { prisma } = await import("@/lib/db");
const attachmentsRoute = await import("@/app/api/documents/[id]/attachments/route");
const attachmentRoute = await import("@/app/api/attachments/[id]/route");
const sharesRoute = await import("@/app/api/documents/[id]/shares/route");
const shareRoute = await import("@/app/api/documents/[id]/shares/[userId]/route");
const notificationsRoute = await import("@/app/api/notifications/route");
const readRoute = await import("@/app/api/notifications/read/route");

const runId = `n${Date.now()}`;
let alice: CurrentUser, bob: CurrentUser;
let docId: string;
const uploaded: string[] = [];

const as = (u: CurrentUser | null) => {
  currentUser = u;
};
const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });
const json = (body: unknown) =>
  new Request("http://t/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

function uploadRequest(name: string, content: string, allowDuplicate = false) {
  const form = new FormData();
  form.append("file", new File([content], name, { type: "text/plain" }));
  if (allowDuplicate) form.append("allowDuplicate", "true");
  return new Request("http://t/api", { method: "POST", body: form });
}

async function upload(name: string, content: string, allowDuplicate = false) {
  const res = await attachmentsRoute.POST(uploadRequest(name, content, allowDuplicate), ctx({ id: docId }));
  const body = await res.json();
  if (res.status === 201) uploaded.push(body.id);
  return { status: res.status, body };
}

beforeAll(async () => {
  const mk = (name: string) =>
    prisma.user.create({ data: { email: `${name}.${runId}@test.local`, name }, select: { id: true, email: true, name: true } });
  alice = await mk("alice");
  bob = await mk("bob");
  docId = (await prisma.document.create({ data: { title: "Notes", ownerId: alice.id } })).id;
});

afterAll(async () => {
  as(alice);
  for (const id of uploaded) await attachmentRoute.DELETE(new Request("http://t"), ctx({ id })).catch(() => {});
  await prisma.user.deleteMany({ where: { email: { endsWith: `.${runId}@test.local` } } });
  await prisma.$disconnect();
});

beforeEach(() => as(null));

describe("numberedFilename", () => {
  it("inserts the copy number before the extension", () => {
    expect(numberedFilename("report.pdf", 2)).toBe("report (2).pdf");
    expect(numberedFilename("archive.tar.gz", 3)).toBe("archive.tar (3).gz");
    expect(numberedFilename("README", 2)).toBe("README (2)");
    expect(numberedFilename(".env", 2)).toBe(".env (2)");
    expect(numberedFilename("report.pdf", 1)).toBe("report.pdf");
  });
});

describe("duplicate uploads (per user, by SHA-256)", () => {
  it("asks before storing the same bytes twice, then numbers confirmed copies", async () => {
    as(alice);
    const first = await upload("notes.txt", `hello ${runId}`);
    expect(first.status).toBe(201);
    expect(first.body.filename).toBe("notes.txt");

    // Same content, even under a different name → 409 with details for the popup.
    const dup = await upload("renamed.txt", `hello ${runId}`);
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe("DUPLICATE_FILE");
    expect(dup.body.duplicate).toMatchObject({ filename: "notes.txt", documentId: docId, documentTitle: "Notes" });

    // User confirms → stored with a numbered name.
    expect((await upload("notes.txt", `hello ${runId}`, true)).body.filename).toBe("notes (2).txt");
    expect((await upload("notes.txt", `hello ${runId}`, true)).body.filename).toBe("notes (3).txt");

    // Different content is never a duplicate.
    expect((await upload("notes.txt", `other ${runId}`)).status).toBe(201);
  });

  it("is scoped to the uploader — another user's identical file is not flagged", async () => {
    as(alice);
    await sharesRoute.POST(json({ email: bob.email, role: "EDITOR" }), ctx({ id: docId }));
    as(bob);
    const res = await upload("notes.txt", `hello ${runId}`);
    expect(res.status).toBe(201);
    expect(res.body.filename).toBe("notes.txt");
  });
});

describe("share notifications", () => {
  it("notifies on new share and role change, not on no-op re-share; revoking clears them", async () => {
    const doc = await prisma.document.create({ data: { title: "Roadmap", ownerId: alice.id } });
    const id = doc.id;
    const bobNotifs = () => prisma.notification.findMany({ where: { userId: bob.id, documentId: id }, orderBy: { createdAt: "asc" } });

    as(alice);
    await sharesRoute.POST(json({ email: bob.email, role: "VIEWER" }), ctx({ id }));
    await sharesRoute.POST(json({ email: bob.email, role: "VIEWER" }), ctx({ id })); // no-op
    await sharesRoute.POST(json({ email: bob.email, role: "EDITOR" }), ctx({ id }));
    expect((await bobNotifs()).map((n) => [n.type, n.role])).toEqual([
      ["DOCUMENT_SHARED", "VIEWER"],
      ["SHARE_ROLE_CHANGED", "EDITOR"],
    ]);

    // Recipient sees them (and only their own), then marks one read.
    as(bob);
    const list = await (await notificationsRoute.GET()).json();
    const mine = list.items.filter((n: { document: { id: string } }) => n.document.id === id);
    expect(mine).toHaveLength(2);
    expect(mine[0].actor.name).toBe("alice");
    const before = list.unread;
    await readRoute.POST(json({ ids: [mine[0].id] }));
    expect((await (await notificationsRoute.GET()).json()).unread).toBe(before - 1);

    // Alice can't mark Bob's notifications read.
    as(alice);
    expect((await (await readRoute.POST(json({ ids: [mine[1].id] }))).json()).updated).toBe(0);

    // Revoking access removes notifications that would now lead to a 404.
    await shareRoute.DELETE(new Request("http://t"), ctx({ id, userId: bob.id }));
    expect(await bobNotifs()).toHaveLength(0);
  });
});
