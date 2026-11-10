import { describe, expect, it } from "vitest";
import { authEmail, parseDays, parseEmployeeForm } from "@/lib/employees";

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
