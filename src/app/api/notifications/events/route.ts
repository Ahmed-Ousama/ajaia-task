import { handle, requireApiUser } from "@/lib/http";
import { sseResponse, subscribeUser } from "@/lib/realtime";

export const dynamic = "force-dynamic";

/** SSE stream: pushes a ping to the signed-in user's bell whenever they get a notification. */
export const GET = handle(async (req: Request) => {
  const user = await requireApiUser();
  return sseResponse(req, (send) => subscribeUser(user.id, send));
});
