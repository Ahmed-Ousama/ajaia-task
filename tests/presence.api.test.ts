/** Presence heartbeat + "saved by someone else" detection (real route handlers + Postgres). */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/session";

let currentUser: CurrentUser | null = null;
vi.mock("@/lib/session", () => ({
  getCurrentUser: async () => currentUser,
  requireUser: async () => currentUser,
}));

const { prisma } = await import("@/lib/db");
const presenceRoute = await import("@/app/api/documents/[id]/presence/route");
const documentRoute = await import("@/app/api/documents/[id]/route");

const runId = `p${Date.now()}`;
let alice: CurrentUser, bob: CurrentUser, eve: CurrentUser;
let docId: string;
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const beat = async (u: CurrentUser) => {
  currentUser = u;
  const res = await presenceRoute.POST(new Request("http://t", { method: "POST" }), ctx(docId));
  return { status: res.status, body: res.status === 200 ? await res.json() : null };
};

beforeAll(async () => {
  const mk = (name: string) =>
    prisma.user.create({ data: { email: `${name}.${runId}@test.local`, name }, select: { id: true, email: true, name: true } });
  [alice, bob, eve] = await Promise.all([mk("alice"), mk("bob"), mk("eve")]);
  docId = (
    await prisma.document.create({
      data: { title: "Live", ownerId: alice.id, shares: { create: { userId: bob.id, role: "EDITOR" } } },
    })
  ).id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { endsWith: `.${runId}@test.local` } } });
  await prisma.$disconnect();
});

describe("presence", () => {
  it("lists other active users, never yourself, and rejects outsiders", async () => {
    expect((await beat(alice)).body.active).toEqual([]);
    const bobView = await beat(bob);
    expect(bobView.body.active).toEqual([{ id: alice.id, name: "alice" }]);
    expect((await beat(alice)).body.active).toEqual([{ id: bob.id, name: "bob" }]);
    expect((await beat(eve)).status).toBe(404);
  });

  it("reports who saved last so other tabs can offer to load the newer copy", async () => {
    currentUser = bob;
    const patch = new Request("http://t", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "<p>from bob</p>" }),
    });
    expect((await documentRoute.PATCH(patch, ctx(docId))).status).toBe(200);
    const { body } = await beat(alice);
    expect(body.lastEditedBy).toEqual({ id: bob.id, name: "bob" });
    expect(Date.parse(body.updatedAt)).toBeGreaterThan(0);
  });

  it("leaving removes you from the active list", async () => {
    currentUser = bob;
    await presenceRoute.DELETE(new Request("http://t", { method: "DELETE" }), ctx(docId));
    expect((await beat(alice)).body.active).toEqual([]);
  });
});
