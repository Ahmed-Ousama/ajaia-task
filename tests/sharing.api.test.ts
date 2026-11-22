/**
 * Integration test: exercises the real route handlers against Postgres.
 * Only the session lookup is mocked (Keycloak login can't run in a unit test).
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
const documentsRoute = await import("@/app/api/documents/route");
const documentRoute = await import("@/app/api/documents/[id]/route");
const sharesRoute = await import("@/app/api/documents/[id]/shares/route");

const runId = `t${Date.now()}`;
let owner: CurrentUser, editor: CurrentUser, outsider: CurrentUser;

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const json = (method: string, body: unknown) =>
  new Request("http://test.local/api", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const as = (u: CurrentUser | null) => {
  currentUser = u;
};

async function mkUser(name: string) {
  return prisma.user.create({
    data: { email: `${name}.${runId}@test.local`, name },
    select: { id: true, email: true, name: true },
  });
}

beforeAll(async () => {
  owner = await mkUser("owner");
  editor = await mkUser("editor");
  outsider = await mkUser("outsider");
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { endsWith: `.${runId}@test.local` } } }); // cascades docs/shares
  await prisma.$disconnect();
});

beforeEach(() => as(null));

describe("document sharing (API + DB)", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await documentsRoute.POST(json("POST", {}));
    expect(res.status).toBe(401);
  });

  it("owner creates, shares; access follows the share role end to end", async () => {
    as(owner);
    const created = await documentsRoute.POST(json("POST", { title: "Plan" }));
    expect(created.status).toBe(201);
    const { id } = await created.json();

    // Before sharing, other users can't even tell the document exists.
    as(editor);
    expect((await documentRoute.GET(new Request("http://t"), ctx(id))).status).toBe(404);
    expect((await sharesRoute.POST(json("POST", { email: outsider.email }), ctx(id))).status).toBe(404);

    as(owner);
    const shared = await sharesRoute.POST(json("POST", { email: editor.email, role: "VIEWER" }), ctx(id));
    expect(shared.status).toBe(201);

    // Viewer: can read, cannot edit.
    as(editor);
    const read = await documentRoute.GET(new Request("http://t"), ctx(id));
    expect(read.status).toBe(200);
    expect((await read.json()).access).toBe("viewer");
    const blocked = await documentRoute.PATCH(json("PATCH", { content: "<p>hi</p>" }), ctx(id));
    expect(blocked.status).toBe(403);
    // Only the owner may share, even with access to the document.
    expect((await sharesRoute.POST(json("POST", { email: outsider.email }), ctx(id))).status).toBe(403);

    // Owner upgrades to editor → edits persist.
    as(owner);
    await sharesRoute.POST(json("POST", { email: editor.email, role: "EDITOR" }), ctx(id));
    as(editor);
    const edited = await documentRoute.PATCH(json("PATCH", { content: "<p><strong>hi</strong></p>" }), ctx(id));
    expect(edited.status).toBe(200);
    const stored = await prisma.document.findUniqueOrThrow({ where: { id } });
    expect(stored.content).toBe("<p><strong>hi</strong></p>");

    // Editors still can't delete; outsiders still see nothing.
    expect((await documentRoute.DELETE(new Request("http://t"), ctx(id))).status).toBe(403);
    as(outsider);
    expect((await documentRoute.GET(new Request("http://t"), ctx(id))).status).toBe(404);
  });

  it("validates input", async () => {
    as(owner);
    const created = await documentsRoute.POST(json("POST", {}));
    const { id } = await created.json();
    expect((await documentRoute.PATCH(json("PATCH", { title: "   " }), ctx(id))).status).toBe(400);
    expect((await sharesRoute.POST(json("POST", { email: "not-an-email" }), ctx(id))).status).toBe(400);
    expect((await sharesRoute.POST(json("POST", { email: `nobody.${runId}@test.local` }), ctx(id))).status).toBe(404);
  });
});
