import { createServerClient as createClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SESSION_ONLY_COOKIE, sessionCookie } from "./session-cookie";

/**
 * Supabase client acting as the signed-in user (RLS applies).
 * `sessionOnly` overrides the `nur-sitzung` cookie; the login action passes it.
 */
export async function createServerClient(sessionOnly?: boolean) {
  const cookieStore = await cookies();
  const onlySession = sessionOnly ?? cookieStore.has(SESSION_ONLY_COOKIE);
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, sessionCookie(value, options, onlySession)),
            );
          } catch {
            // Server Components cannot set cookies; the middleware refreshes the session.
          }
        },
      },
    },
  );
}
