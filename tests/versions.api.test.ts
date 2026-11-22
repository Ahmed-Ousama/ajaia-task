/**
 * Integration test for version history: real route handlers + Postgres, only the session mocked.
 * Requires the local database: `docker compose up -d db`.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/session";

let currentUser: CurrentUser | null = null;
vi.mock("@/lib/session", () => ({
  getCurrentUser: async () => currentUser,
  requireUser: async () => currentUser,
}));

const { prisma } = await import("@/lib/db");
const documentRoute = await import("@/app/api/documents/[id]/route");
const versionsRoute = await import("@/app/api/documents/[id]/versions/route");
const versionRoute = await import("@/app/api/documents/[id]/versions/[versionId]/route");
const restoreRoute = await import("@/app/api/documents/[id]/versions/[versionId]/restore/route");

const runId = `v${Date.now()}`;
let owner: CurrentUser, editor: CurrentUser, viewer: CurrentUser, outsider: CurrentUser;
let docId: string;

const as = (u: CurrentUser | null) => {
  currentUser = u;
};
const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });
const get = () => new Request("http://t/api");
const post = () => new Request("http://t/api", { method: "POST" });
const patch = (body: unknown) =>
  new Request("http://t/api", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const versionsOf = (id: string) =>
  prisma.documentVersion.findMany({ where: { documentId: id }, orderBy: { createdAt: "asc" } });

beforeAll(async () => {
  const mk = (name: string) =>
    prisma.user.create({ data: { email: `${name}.${runId}@test.local`, name }, select: { id: true, email: true, name: true } });
  owner = await mk("owner");
  editor = await mk("editor");
  viewer = await mk("viewer");
  outsider = await mk("outsider");
  docId = (
    await prisma.document.create({
      data: {
        title: "Spec",
        content: "<p>v0</p>",
        ownerId: owner.id,
        shares: {
          create: [
            { userId: editor.id, role: "EDITOR" },
            { userId: viewer.id, role: "VIEWER" },
          ],
        },
      },
    })
  ).id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { endsWith: `.${runId}@test.local` } } }); // cascades docs/versions
  await prisma.$disconnect();
});

beforeEach(() => as(null));

describe("version history (API + DB)", () => {
  it("records a baseline + version on first save, folds same-author edits, splits on a new author", async () => {
    as(owner);
    expect((await documentRoute.PATCH(patch({ content: "<p>v1</p>" }), ctx({ id: docId }))).status).toBe(200);
    let versions = await versionsOf(docId);
    expect(versions.map((v) => [v.content, v.authorId])).toEqual([
      ["<p>v0</p>", owner.id], // baseline: the state before the first edit
      ["<p>v1</p>", owner.id],
    ]);

    // Same author within the window → the latest version is updated in place.
    await documentRoute.PATCH(patch({ content: "<p>v2</p>" }), ctx({ id: docId }));
    versions = await versionsOf(docId);
    expect(versions).toHaveLength(2);
    expect(versions[1].content).toBe("<p>v2</p>");

    // Different author → a new version.
    as(editor);
    await documentRoute.PATCH(patch({ content: "<p>v3</p>" }), ctx({ id: docId }));
    versions = await versionsOf(docId);
    expect(versions).toHaveLength(3);
    expect(versions[2]).toMatchObject({ content: "<p>v3</p>", authorId: editor.id });
  });

  it("lets viewers list and preview, but not restore; outsiders get 404", async () => {
    as(viewer);
    const listRes = await versionsRoute.GET(get(), ctx({ id: docId }));
    expect(listRes.status).toBe(200);
    const list = await listRes.json();
    expect(list).toHaveLength(3);
    expect(list[0].author.name).toBe("editor"); // newest first
    expect(list[0]).not.toHaveProperty("content");

    const baseline = list[2];
    const detail = await versionRoute.GET(get(), ctx({ id: docId, versionId: baseline.id }));
    expect(detail.status).toBe(200);
    expect((await detail.json()).content).toBe("<p>v0</p>");

    expect((await restoreRoute.POST(post(), ctx({ id: docId, versionId: baseline.id }))).status).toBe(403);

    as(outsider);
    expect((await versionsRoute.GET(get(), ctx({ id: docId }))).status).toBe(404);
    expect((await versionRoute.GET(get(), ctx({ id: docId, versionId: baseline.id }))).status).toBe(404);
  });

  it("restores a version and records the restore as a new version", async () => {
    const baseline = (await versionsOf(docId))[0];
    as(editor);
    const res = await restoreRoute.POST(post(), ctx({ id: docId, versionId: baseline.id }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ title: "Spec", content: "<p>v0</p>" });

    const doc = await prisma.document.findUniqueOrThrow({ where: { id: docId } });
    expect(doc.content).toBe("<p>v0</p>");
    expect(doc.lastEditedById).toBe(editor.id);

    const versions = await versionsOf(docId);
    expect(versions).toHaveLength(4);
    expect(versions[3]).toMatchObject({ content: "<p>v0</p>", authorId: editor.id });
  });

  it("rejects version ids that belong to another document", async () => {
    const other = await prisma.document.create({
      data: { title: "Other", ownerId: owner.id, versions: { create: { title: "Other", content: "<p>x</p>", authorId: owner.id } } },
      include: { versions: true },
    });
    const foreign = other.versions[0].id;
    as(owner);
    expect((await versionRoute.GET(get(), ctx({ id: docId, versionId: foreign }))).status).toBe(404);
    expect((await restoreRoute.POST(post(), ctx({ id: docId, versionId: foreign }))).status).toBe(404);
    expect((await prisma.document.findUniqueOrThrow({ where: { id: docId } })).content).toBe("<p>v0</p>");
  });
});
