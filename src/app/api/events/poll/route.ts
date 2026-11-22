import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { loadDocumentWithAccess } from "@/lib/documents";
import { handle, requireApiUser } from "@/lib/http";
import { currentSeq, eventsSince, publish, waitForEvent } from "@/lib/realtime";

export const dynamic = "force-dynamic";

/**
 * Long-poll fallback for /api/events, for networks/proxies that buffer Server-Sent Events.
 * GET ?doc=<id>&since=<seq> → returns as soon as there are newer events for the caller's channels
 * (or after ~20 s with none). Each poll also refreshes the caller's presence on the document.
 */
export const GET = handle(async (req: Request) => {
  const user = await requireApiUser();
  const url = new URL(req.url);
  const docParam = url.searchParams.get("doc");
  const since = Number(url.searchParams.get("since") ?? "0") || 0;
  const doc = docParam ? (await loadDocumentWithAccess(docParam, user.id)).doc : null;
  const topics = [`user:${user.id}`, ...(doc ? [`doc:${doc.id}`] : [])];

  if (doc) {
    const before = await prisma.documentPresence.findUnique({
      where: { documentId_userId: { documentId: doc.id, userId: user.id } },
      select: { lastSeenAt: true },
    });
    await prisma.documentPresence.upsert({
      where: { documentId_userId: { documentId: doc.id, userId: user.id } },
      update: { lastSeenAt: new Date() },
      create: { documentId: doc.id, userId: user.id },
    });
    if (!before || Date.now() - before.lastSeenAt.getTime() > 30_000) publish(doc.id, { type: "presence" });
  }

  if (since === 0) return NextResponse.json({ seq: currentSeq(), events: [] }); // first call: just sync the cursor

  let events = eventsSince(since, topics);
  if (events.length === 0) {
    await waitForEvent(topics, 20_000, req.signal);
    events = eventsSince(since, topics);
  }
  return NextResponse.json({ seq: currentSeq(), events }, { headers: { "Cache-Control": "no-store" } });
});
