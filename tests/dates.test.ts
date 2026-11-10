import { describe, expect, it } from "vitest";
import { formatDays, formatRange, fromKey, toKey } from "@/lib/dates";

describe("date keys", () => {
  it("round-trips a local date", () => {
    expect(toKey(fromKey("2026-03-08"))).toBe("2026-03-08");
  });
});

describe("formatRange", () => {
  it("shows a single day", () => expect(formatRange("2026-11-17", "2026-11-17")).toBe("17.11."));
  it("shortens a range within one month", () =>
    expect(formatRange("2026-11-17", "2026-11-18")).toBe("17.–18.11."));
  it("spans months", () => expect(formatRange("2026-11-30", "2026-12-04")).toBe("30.11.–4.12."));
});

describe("formatDays", () => {
  it("uses a German decimal comma", () => expect(formatDays(2.5)).toBe("2,5"));
  it("drops trailing zeros", () => expect(formatDays(14)).toBe("14"));
});
