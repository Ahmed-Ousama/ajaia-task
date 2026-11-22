"use server";

import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { getToken } from "next-auth/jwt";
import { signIn, signOut } from "@/auth";
import { endSession } from "@/lib/keycloak";

export type LoginState = { error?: string; email?: string };

/** Login form action: validates via Keycloak (see src/auth.ts) and redirects home on success. */
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password.", email };

  try {
    await signIn("credentials", { email, password, redirectTo: "/" });
    return {};
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.type === "CredentialsSignin" && (err as AuthError & { code?: string }).code === "unavailable") {
        return { error: "The sign-in service is unavailable right now. Please try again in a minute.", email };
      }
      if (err.type === "CredentialsSignin") return { error: "Incorrect email or password.", email };
      return { error: "Sign-in failed. Please try again.", email };
    }
    throw err; // success is a redirect (NEXT_REDIRECT) — let Next handle it
  }
}

/** Clears the app session and ends the Keycloak session server-side (back-channel logout). */
export async function signOutEverywhere() {
  const token = await getToken({
    req: { headers: await headers() },
    secret: process.env.AUTH_SECRET!,
    secureCookie: (process.env.AUTH_URL ?? "").startsWith("https://"),
  });
  if (token?.kcRefreshToken) await endSession(token.kcRefreshToken);
  await signOut({ redirectTo: "/login" });
}
