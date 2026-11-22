/**
 * Integration test for document comments: real route handlers + Postgres, session mocked.
 * Requires `docker compose up -d db`.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/session";

let currentUser: CurrentUser | null = null;
vi.mock("@/lib/session", () => ({
  getCurrentUser: async () => currentUser,
  requireUser: async () => currentUser,
}));

const { prisma } = await import("@/lib/db");
const commentsRoute = await import("@/app/api/documents/[id]/comments/route");
const commentRoute = await import("@/app/api/comments/[id]/route");

const runId = `c${Date.now()}`;
let owner: CurrentUser, editor: CurrentUser, viewer: CurrentUser, outsider: CurrentUser;
let docId: string;

const as = (u: CurrentUser | null) => {
  currentUser = u;
};
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const json = (method: string, body: unknown) =>
  new Request("http://t/api", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function post(body: unknown) {
  const res = await commentsRoute.POST(json("POST", body), ctx(docId));
  return { status: res.status, body: res.status === 201 ? await res.json() : await res.json().catch(() => null) };
}
const resolve = (id: string, resolved = true) => commentRoute.PATCH(json("PATCH", { resolved }), ctx(id));
const del = (id: string) => commentRoute.DELETE(new Request("http://t"), ctx(id));

beforeAll(async () => {
  const mk = (name: string) =>
    prisma.user.create({ data: { email: `${name}.${runId}@test.local`, name }, select: { id: true, email: true, name: true } });
  [owner, editor, viewer, outsider] = await Promise.all([mk("owner"), mk("editor"), mk("viewer"), mk("outsider")]);
  docId = (
    await prisma.document.create({
      data: {
        title: "Spec",
        ownerId: owner.id,
        shares: { create: [{ userId: editor.id, role: "EDITOR" }, { userId: viewer.id, role: "VIEWER" }] },
      },
    })
  ).id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { endsWith: `.${runId}@test.local` } } }); // cascades docs/comments
  await prisma.$disconnect();
});

beforeEach(() => as(null));

describe("comments (API + DB)", () => {
  it("lets anyone with access comment, hides the document from outsiders", async () => {
    as(viewer);
    const created = await post({ body: "  Looks good  ", quote: "  intro paragraph " });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ body: "Looks good", quote: "intro paragraph", resolvedAt: null });
    expect(created.body.author).toEqual({ id: viewer.id, name: "viewer" });

    as(owner);
    const list = await (await commentsRoute.GET(new Request("http://t"), ctx(docId))).json();
    expect(list.map((c: { id: string }) => c.id)).toContain(created.body.id);

    as(outsider);
    expect((await commentsRoute.GET(new Request("http://t"), ctx(docId))).status).toBe(404);
    expect((await post({ body: "hi" })).status).toBe(404);
    expect((await resolve(created.body.id)).status).toBe(404);
  });

  it("resolve: editors/owner or the author; viewers can't resolve others' comments", async () => {
    as(editor);
    const byEditor = (await post({ body: "Needs a diagram" })).body;
    as(viewer);
    const byViewer = (await post({ body: "Typo in heading" })).body;

    // Viewer can't resolve someone else's comment...
    expect((await resolve(byEditor.id)).status).toBe(403);
    // ...but can resolve (and reopen) their own.
    const own = await resolve(byViewer.id);
    expect(own.status).toBe(200);
    expect((await own.json()).resolvedAt).not.toBeNull();
    expect((await (await resolve(byViewer.id, false)).json()).resolvedAt).toBeNull();

    // Editor can resolve anyone's comment.
    as(editor);
    expect((await resolve(byViewer.id)).status).toBe(200);
  });

  it("delete: only the author or the document owner", async () => {
    as(viewer);
    const c1 = (await post({ body: "first" })).body;
    const c2 = (await post({ body: "second" })).body;

    as(editor);
    expect((await del(c1.id)).status).toBe(403); // editors can't delete others' comments

    as(viewer);
    expect((await del(c1.id)).status).toBe(204); // author

    as(owner);
    expect((await del(c2.id)).status).toBe(204); // document owner
    expect(await prisma.comment.count({ where: { id: { in: [c1.id, c2.id] } } })).toBe(0);
  });

  it("validates input", async () => {
    as(owner);
    expect((await post({ body: "   " })).status).toBe(400);
    expect((await post({ body: "x".repeat(2001) })).status).toBe(400);
    expect((await post({ body: "ok", quote: "q".repeat(501) })).status).toBe(400);
    const emptyQuote = await post({ body: "ok", quote: "   " });
    expect(emptyQuote.status).toBe(201);
    expect(emptyQuote.body.quote).toBeNull();
    const c = emptyQuote.body;
    expect((await commentRoute.PATCH(json("PATCH", { resolved: "yes" }), ctx(c.id))).status).toBe(400);
    expect((await resolve("does-not-exist")).status).toBe(404);
  });
});
