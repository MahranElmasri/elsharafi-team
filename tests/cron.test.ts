import { describe, expect, it } from "vitest";
import { isAuthorized, parseAsOf } from "@/lib/cron";

describe("isAuthorized", () => {
  it("accepts only the exact bearer secret", () => {
    expect(isAuthorized("Bearer s3cret", "s3cret")).toBe(true);
    expect(isAuthorized("Bearer s3cret ", "s3cret")).toBe(false);
    expect(isAuthorized("Bearer wrong", "s3cret")).toBe(false);
    expect(isAuthorized("s3cret", "s3cret")).toBe(false);
    expect(isAuthorized(null, "s3cret")).toBe(false);
  });
});

describe("parseAsOf", () => {
  it("reads an optional, real calendar date", () => {
    expect(parseAsOf(null)).toBeNull();
    expect(parseAsOf({})).toBeNull();
    expect(parseAsOf({ asOf: "2027-02-01" })).toBe("2027-02-01");
    expect(parseAsOf({ asOf: "2027-02-30" })).toBe("invalid");
    expect(parseAsOf({ asOf: "1.2.2027" })).toBe("invalid");
  });
});
