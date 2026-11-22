import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getCurrentUser, type CurrentUser } from "@/lib/session";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Extra machine-readable fields merged into the JSON error body. */
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const notFound = () => new HttpError(404, "Document not found or you don't have access.");
export const forbidden = (msg = "You don't have permission to do that.") => new HttpError(403, msg);

export async function requireApiUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "You are not signed in.");
  return user;
}

/** Wraps a route handler so thrown HttpErrors / validation errors become JSON responses. */
export function handle<Args extends unknown[]>(fn: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json({ error: err.message, ...err.details }, { status: err.status });
      }
      if (err instanceof ZodError) {
        const msg = err.issues[0]?.message ?? "Invalid request.";
        return NextResponse.json({ error: msg }, { status: 400 });
      }
      console.error(err);
      return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }
  };
}
