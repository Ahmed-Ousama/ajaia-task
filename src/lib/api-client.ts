/** Error carrying the API's status and JSON body (e.g. duplicate-file details on 409). */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data: Record<string, unknown>,
  ) {
    super(message);
  }
}

/** Small fetch wrapper for client components: throws an ApiError carrying the API's message. */
export async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    if (res.status === 401) window.location.href = "/login";
    throw new ApiError(res.status, (data.error as string) ?? `Request failed (${res.status})`, data);
  }
  return data as T;
}

export const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
