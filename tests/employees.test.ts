import { describe, expect, it } from "vitest";
import { authEmail, parseDays, parseEmployeeForm, suggestedAllowance } from "@/lib/employees";

function form(fields: Record<string, string | string[]>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
  }
  return f;
}

const valid = {
  fullName: " Anna Arbeiter ",
  username: "Anna.A",
  email: "",
  team: "arbeiter",
  role: "employee",
  workdays: ["4", "1", "2", "2", "7"],
  startDate: "2026-07-01",
  endDate: "",
};

describe("parseEmployeeForm", () => {
  it("cleans the input", () => {
    const r = parseEmployeeForm(form(valid));
    expect(r).toEqual({
      ok: true,
      value: {
        fullName: "Anna Arbeiter",
        username: "anna.a",
        email: null,
        team: "arbeiter",
        role: "employee",
        workdays: [1, 2, 4],
        startDate: "2026-07-01",
        endDate: null,
      },
    });
  });

  it("refuses missing workdays, unknown teams and an end before the start", () => {
    expect(parseEmployeeForm(form({ ...valid, workdays: [] }))).toMatchObject({ ok: false });
    expect(parseEmployeeForm(form({ ...valid, team: "chef" }))).toMatchObject({ ok: false });
    expect(parseEmployeeForm(form({ ...valid, endDate: "2026-06-30" }))).toEqual({
      ok: false,
      error: "Das Austrittsdatum liegt vor dem Eintrittsdatum.",
    });
  });

  it("never makes anyone admin by accident", () => {
    const r = parseEmployeeForm(form({ ...valid, role: "superuser" }));
    expect(r.ok && r.value.role).toBe("employee");
  });
});

describe("helpers", () => {
  it("uses an internal address when there is no email", () => {
    expect(authEmail("anna", null)).toBe("anna@users.mvz-elsharafi.invalid");
    expect(authEmail("anna", "anna@example.org")).toBe("anna@example.org");
  });

  it("reads whole and half days with comma or point", () => {
    expect(parseDays("27,5")).toBe(27.5);
    expect(parseDays("30")).toBe(30);
    expect(parseDays("2.3")).toBeNull();
    expect(parseDays("-1")).toBeNull();
    expect(parseDays("")).toBeNull();
  });
});

describe("suggestedAllowance (§5 BUrlG, R13)", () => {
  it("scales 30 full-time days by workdays for a full year", () => {
    expect([5, 4, 3, 2, 1].map((n) => suggestedAllowance(n, "2020-01-01", null, 2026))).toEqual([
      30, 24, 18, 12, 6,
    ]);
  });
  it("counts only full months employed (same cases as pgTAP 04_balances)", () => {
    expect(suggestedAllowance(3, "2026-07-01", null, 2026)).toBe(9);
    expect(suggestedAllowance(5, "2020-01-01", "2026-03-31", 2026)).toBe(8);
    expect(suggestedAllowance(4, "2026-07-01", null, 2026)).toBe(12);
    expect(suggestedAllowance(5, "2026-01-15", null, 2026)).toBe(28); // 11 months: 27.5
    expect(suggestedAllowance(5, "2026-01-01", "2026-06-29", 2026)).toBe(13); // 5 months: 12.5
  });
  it("rounds up from .5, otherwise keeps one decimal", () => {
    expect(suggestedAllowance(3, "2026-06-01", null, 2026)).toBe(11); // 10.5
    expect(suggestedAllowance(1, "2026-03-01", null, 2026)).toBe(5); // 5.0
    expect(suggestedAllowance(1, "2026-08-01", null, 2026)).toBe(3); // 2.5
    expect(suggestedAllowance(2, "2026-02-01", null, 2026)).toBe(11); // 11.0
    expect(suggestedAllowance(1, "2020-01-01", null, 2026, 26)).toBe(5.2); // 5.2
  });
  it("is 0 outside the employment", () => {
    expect(suggestedAllowance(5, "2027-01-01", null, 2026)).toBe(0);
  });
});
