/** Word export: real route handler + Postgres; the produced .docx is read back with mammoth (the importer). */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import mammoth from "mammoth";
import JSZip from "jszip";
import type { CurrentUser } from "@/lib/session";

let currentUser: CurrentUser | null = null;
vi.mock("@/lib/session", () => ({
  getCurrentUser: async () => currentUser,
  requireUser: async () => currentUser,
}));

const { prisma } = await import("@/lib/db");
const exportRoute = await import("@/app/api/documents/[id]/export/route");

const runId = `x${Date.now()}`;
let owner: CurrentUser, outsider: CurrentUser;
let docId: string;
const get = (format = "docx") => exportRoute.GET(new Request(`http://t/api?format=${format}`), { params: Promise.resolve({ id: docId }) });

beforeAll(async () => {
  const mk = (name: string) =>
    prisma.user.create({ data: { email: `${name}.${runId}@test.local`, name }, select: { id: true, email: true, name: true } });
  [owner, outsider] = await Promise.all([mk("owner"), mk("outsider")]);
  docId = (
    await prisma.document.create({
      data: {
        title: "Quarterly plan",
        ownerId: owner.id,
        content: "<h1>Plan</h1><p>Some <strong>bold</strong> and <em>italic</em> text.</p><ul><li><p>one</p></li><li><p>two</p></li></ul>",
      },
    })
  ).id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { endsWith: `.${runId}@test.local` } } });
  await prisma.$disconnect();
});

describe("export to Word", () => {
  it("returns a .docx that round-trips headings, bold, italic and lists", async () => {
    currentUser = owner;
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("wordprocessingml");
    expect(res.headers.get("content-disposition")).toContain("Quarterly%20plan.docx");

    const buffer = Buffer.from(await res.arrayBuffer());
    expect(buffer.subarray(0, 2).toString()).toBe("PK"); // .docx is a zip container
    const { value: html } = await mammoth.convertToHtml({ buffer });
    expect(html).toContain("<h1>Plan</h1>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toMatch(/<ul><li>one<\/li><li>two<\/li><\/ul>/);
  });

  it("keeps text colour and highlights as Word formatting", async () => {
    currentUser = owner;
    await prisma.document.update({
      where: { id: docId },
      data: {
        content:
          '<p><span style="color: #dc2626;">red</span> <mark data-color="#bbf7d0" style="background-color: #bbf7d0; color: inherit;">marked</mark></p>',
      },
    });
    const res = await get();
    const zip = await JSZip.loadAsync(Buffer.from(await res.arrayBuffer()));
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain('<w:color w:val="dc2626"/>');
    expect(xml).toMatch(/<w:shd [^>]*w:fill="bbf7d0"/);
  });

  it("is access-controlled and validates the format", async () => {
    currentUser = outsider;
    expect((await get()).status).toBe(404);
    currentUser = owner;
    expect((await get("exe")).status).toBe(400);
  });
});
