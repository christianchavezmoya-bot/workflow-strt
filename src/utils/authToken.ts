import { secureGet } from "../services/secureStorage";

/** Decode JWT `exp` claim (epoch seconds). Returns null when missing or invalid. */
export function getTokenExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp ?? null;
  } catch {
    return null;
  }
}

/** True when the stored (or provided) JWT is past its expiry time. */
export function isAuthTokenExpired(token?: string | null): boolean {
  const t = token ?? secureGet("auth_token");
  if (!t || t === "local") return false;
  const exp = getTokenExpiry(t);
  if (!exp) return false;
  return exp * 1000 <= Date.now();
}
