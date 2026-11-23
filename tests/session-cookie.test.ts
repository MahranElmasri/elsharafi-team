import { describe, expect, it } from "vitest";
import { sessionCookie } from "@/lib/supabase/session-cookie";

const options = { path: "/", sameSite: "lax" as const, maxAge: 34560000 };

describe("sessionCookie", () => {
  it("keeps maxAge when the user stays signed in", () => {
    expect(sessionCookie("token", options, false)).toEqual(options);
  });

  it("drops maxAge and expires for a session-only login", () => {
    const result = sessionCookie("token", { ...options, expires: new Date() }, true);
    expect(result).toEqual({ path: "/", sameSite: "lax" });
  });

  it("keeps maxAge 0 so a deletion still deletes", () => {
    const deletion = { ...options, maxAge: 0 };
    expect(sessionCookie("", deletion, true)).toEqual(deletion);
  });
});
