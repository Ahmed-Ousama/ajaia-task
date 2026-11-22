/**
 * Server-side Keycloak client (OIDC endpoints of realm `ajaia`).
 * The app's own login form posts credentials to our server, which exchanges them with Keycloak
 * (Direct Access Grant). Keycloak stays the source of truth for users and passwords, and its
 * brute-force protection applies to these attempts.
 */
const issuer = () => process.env.AUTH_KEYCLOAK_ISSUER!;
const clientId = () => process.env.AUTH_KEYCLOAK_ID ?? "ajaia-docs";
const clientSecret = () => process.env.AUTH_KEYCLOAK_SECRET!;

export class KeycloakUnavailableError extends Error {}

export type KeycloakTokens = { access_token: string; id_token?: string; refresh_token?: string };
export type KeycloakProfile = { sub: string; email?: string; name?: string; preferred_username?: string };

async function post(path: string, body: Record<string, string>) {
  try {
    return await fetch(`${issuer()}/protocol/openid-connect/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId(), client_secret: clientSecret(), ...body }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new KeycloakUnavailableError(String(err));
  }
}

/** Returns tokens for valid credentials, `null` for invalid ones; throws if Keycloak is down. */
export async function passwordGrant(username: string, password: string): Promise<KeycloakTokens | null> {
  const res = await post("token", { grant_type: "password", username, password, scope: "openid email profile" });
  if (res.ok) return (await res.json()) as KeycloakTokens;
  if (res.status === 400 || res.status === 401) return null; // invalid_grant: bad credentials / locked / disabled
  throw new KeycloakUnavailableError(`token endpoint returned ${res.status}`);
}

/** Identity as asserted by Keycloak for the access token (it validates the token itself). */
export async function userInfo(accessToken: string): Promise<KeycloakProfile> {
  let res: Response;
  try {
    res = await fetch(`${issuer()}/protocol/openid-connect/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new KeycloakUnavailableError(String(err));
  }
  if (!res.ok) throw new KeycloakUnavailableError(`userinfo returned ${res.status}`);
  return (await res.json()) as KeycloakProfile;
}

/** Ends the Keycloak session server-side (back-channel), so no browser redirect is needed. */
export async function endSession(refreshToken: string) {
  await post("logout", { refresh_token: refreshToken }).catch(() => undefined);
}
