import NextAuth, { CredentialsSignin, type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { KeycloakUnavailableError, passwordGrant, userInfo } from "@/lib/keycloak";

declare module "next-auth" {
  interface Session {
    /** `id` is our own `User.id` (not the Keycloak `sub`). */
    user: { id: string } & DefaultSession["user"];
  }
  interface User {
    refreshToken?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    /** Local `User.id`, resolved once at sign-in. */
    uid?: string;
    /** Keycloak refresh token, kept in the encrypted session cookie to end the Keycloak session on sign-out. */
    kcRefreshToken?: string;
  }
}

/** Shown to the user as "Sign-in service is unavailable" instead of "wrong password". */
export class IdentityProviderUnavailable extends CredentialsSignin {
  code = "unavailable";
}

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().min(1).max(254),
  password: z.string().min(1).max(256),
});

/**
 * Authentication is delegated to Keycloak (realm `ajaia`). Our login page posts the credentials
 * to the server, which exchanges them with Keycloak; on success the Keycloak identity is mapped
 * to a local `User` row by email. Sessions are encrypted JWT cookies (no DB adapter needed).
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  basePath: "/api/auth",
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 }, // a working day; re-auth against Keycloak after
  useSecureCookies: (process.env.AUTH_URL ?? "").startsWith("https://"),
  pages: { signIn: "/login", error: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        try {
          const tokens = await passwordGrant(parsed.data.email, parsed.data.password);
          if (!tokens) return null; // wrong credentials (or locked by Keycloak brute-force protection)
          const profile = await userInfo(tokens.access_token);
          const email = profile.email?.trim().toLowerCase();
          if (!email) return null;
          const name = profile.name?.trim() || profile.preferred_username || email;
          const user = await prisma.user.upsert({
            where: { email },
            update: { name },
            create: { email, name },
          });
          return { id: user.id, email: user.email, name: user.name, refreshToken: tokens.refresh_token };
        } catch (err) {
          if (err instanceof KeycloakUnavailableError) {
            console.error("Keycloak unavailable during sign-in:", err.message);
            throw new IdentityProviderUnavailable();
          }
          throw err;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.kcRefreshToken = user.refreshToken;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.uid) session.user.id = token.uid;
      return session;
    },
  },
});
