import type { CookieOptions } from "@supabase/ssr";

/** Present while the user signed in without "Angemeldet bleiben" (R1). */
export const SESSION_ONLY_COOKIE = "nur-sitzung";

/**
 * Options for a Supabase auth cookie. Without "Angemeldet bleiben" the cookie
 * gets no `maxAge`/`expires`, so the browser drops it when it closes.
 * A deletion (empty value) keeps its `maxAge: 0`.
 */
export function sessionCookie(value: string, options: CookieOptions, sessionOnly: boolean) {
  if (!sessionOnly || value === "") return options;
  const rest = { ...options };
  delete rest.maxAge;
  delete rest.expires;
  return rest;
}
