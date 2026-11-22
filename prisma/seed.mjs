// Idempotent seed: demo users always exist; sample documents are only created once.
// Users authenticate through Keycloak (realm "ajaia"); these rows mirror the realm's demo
// users so documents can be shared with them before their first login.
// Plain JS (not TS) so it runs in the production container without a TS toolchain.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const USERS = [
  { email: "alice@ajaia.test", name: "Alice Admin" },
  { email: "bob@ajaia.test", name: "Bob Builder" },
  { email: "carol@ajaia.test", name: "Carol Chen" },
];

async function main() {
  const users = {};
  for (const u of USERS) {
    users[u.email] = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: u,
    });
  }

  const alice = users["alice@ajaia.test"];
  const bob = users["bob@ajaia.test"];

  const existing = await prisma.document.count({ where: { ownerId: alice.id } });
  if (existing > 0) {
    console.log("Seed: users ensured, sample documents already present.");
    return;
  }

  await prisma.document.create({
    data: {
      title: "Welcome to Ajaia Docs",
      ownerId: alice.id,
      content:
        "<h1>Welcome to Ajaia Docs</h1>" +
        "<p>This document is owned by <strong>Alice</strong> and shared with <em>Bob</em> as an <u>editor</u>.</p>" +
        "<h2>Try it out</h2>" +
        "<ul><li>Format text with the toolbar</li><li>Rename the document from the title field</li><li>Share it from the <strong>Share</strong> button</li></ul>" +
        "<ol><li>Changes save automatically</li><li>Refresh the page — everything is still here</li></ol>",
      shares: { create: { userId: bob.id, role: "EDITOR" } },
    },
  });

  await prisma.document.create({
    data: {
      title: "Q4 planning notes",
      ownerId: bob.id,
      content:
        "<h2>Q4 planning</h2><p>Bob owns this document and shared it with Alice as a <strong>viewer</strong> (read-only).</p>",
      shares: { create: { userId: alice.id, role: "VIEWER" } },
    },
  });

  console.log("Seed: created demo users and sample documents.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
