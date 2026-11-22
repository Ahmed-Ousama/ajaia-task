import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export type CurrentUser = { id: string; email: string; name: string };

/**
 * Resolves the signed-in user from the Auth.js session (Keycloak OIDC).
 * `session.user.id` is our own `User.id` — the Keycloak identity is mapped to a local
 * user row (by email) at sign-in time in `src/auth.ts`.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  return prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true },
  });
}

/** For server components/pages: redirect to /login when there is no session. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
