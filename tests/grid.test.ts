import { describe, expect, it } from "vitest";
import { berlinToday, buildColumns, parseMonth, shiftMonth, stampTilt, worksOn } from "@/lib/grid";

const holidays2026 = new Map([
  ["2026-12-25", "1. Weihnachtstag"],
  ["2026-12-26", "2. Weihnachtstag"],
]);

describe("buildColumns", () => {
  const dec = buildColumns(2026, 12, holidays2026, "2026-12-24");

  it("lists only Monday to Friday", () => {
    expect(dec).toHaveLength(23);
    expect(dec.every((c) => c.weekday >= 1 && c.weekday <= 5)).toBe(true);
    expect(dec[0]).toMatchObject({ key: "2026-12-01", weekday: 2, isMonthStart: true });
    expect(dec.filter((c) => c.isMonthStart)).toHaveLength(1);
  });

  it("marks Fridays, holidays and today", () => {
    expect(dec.filter((c) => c.isFriday).map((c) => c.day)).toEqual([4, 11, 18, 25]);
    expect(dec.find((c) => c.day === 25)?.holiday).toBe("1. Weihnachtstag");
    expect(dec.find((c) => c.day === 26)).toBeUndefined(); // Saturday
    expect(dec.filter((c) => c.isToday).map((c) => c.day)).toEqual([24]);
  });

  it("handles February in a leap year and a month starting on a Saturday", () => {
    const feb = buildColumns(2028, 2, new Map(), "2028-02-01");
    expect(feb.at(-1)?.key).toBe("2028-02-29");
    const aug = buildColumns(2026, 8, new Map(), "x");
    expect(aug[0]).toMatchObject({ key: "2026-08-03", weekday: 1, isMonthStart: true });
  });
});

describe("worksOn", () => {
  const partTime = { workdays: [1, 2, 4], startDate: "2026-07-01", endDate: "2026-12-18" };
  it("follows the weekday pattern and employment dates", () => {
    expect(worksOn(partTime, { key: "2026-11-16", weekday: 1 })).toBe(true);
    expect(worksOn(partTime, { key: "2026-11-18", weekday: 3 })).toBe(false);
    expect(worksOn(partTime, { key: "2026-06-29", weekday: 1 })).toBe(false);
    expect(worksOn(partTime, { key: "2026-12-21", weekday: 1 })).toBe(false);
  });
});

describe("month navigation", () => {
  it("reads the URL and falls back to this month", () => {
    expect(parseMonth("2026-03", "2026-11-10")).toEqual({ year: 2026, month: 3 });
    expect(parseMonth("2026-13", "2026-11-10")).toEqual({ year: 2026, month: 11 });
    expect(parseMonth(undefined, "2026-11-10")).toEqual({ year: 2026, month: 11 });
  });
  it("crosses year ends", () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });
  it("uses Berlin time for today", () => {
    expect(berlinToday(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
  });
  it("tilts stamps the same way every time, within ±4°", () => {
    expect(stampTilt("a|2026-11-10")).toBe(stampTilt("a|2026-11-10"));
    expect(Math.abs(stampTilt("b|2026-11-11"))).toBeLessThanOrEqual(4);
  });
});
