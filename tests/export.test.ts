import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createServerClient: vi.fn() }));
const { exportWorkbook } = await import("@/lib/export");

const types = new Map([
  ["sick", { letter: "X", label: "Krank", deducts: false, sick: true }],
  ["vacation", { letter: "U", label: "Urlaub", deducts: true, sick: false }],
  ["training", { letter: "F", label: "Fortbildung", deducts: false, sick: false }],
]);

describe("exportWorkbook", () => {
  it("writes a sheet per month with letters, totals, holidays and the year's balances", async () => {
    const wb = exportWorkbook({
      year: 2026,
      asOf: "2026-11-11",
      people: [
        {
          id: "a",
          name: "Anna",
          team: "Ärzte",
          workdays: [1, 2, 4],
          start: "2020-01-01",
          end: null,
        },
        {
          id: "b",
          name: "Ben",
          team: "Arbeiter",
          workdays: [1, 2, 3, 4, 5],
          start: "2026-12-01",
          end: null,
        },
      ],
      days: [
        { user_id: "a", day: "2026-11-02", type: "sick", amount: 1, half: null },
        { user_id: "a", day: "2026-11-03", type: "vacation", amount: 0.5, half: "am" },
        { user_id: "a", day: "2026-11-05", type: "training", amount: 1, half: null },
      ],
      holidays: new Map([["2026-12-25", "1. Weihnachtstag"]]),
      types,
      balances: [
        {
          user_id: "a",
          allowance: 18,
          carryover: 2,
          carryover_expired: 0,
          vacation_taken: 4.5,
          vacation_pending: 0,
          remaining: 15.5,
          sick_days: 3,
        },
      ],
    });
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      "Januar",
      "Februar",
      "März",
      "April",
      "Mai",
      "Juni",
      "Juli",
      "August",
      "September",
      "Oktober",
      "November",
      "Dezember",
      "Jahr",
    ]);

    const nov = wb.getWorksheet("November")!;
    expect(nov.rowCount).toBe(3); // two header rows, Anna; Ben starts in December
    const header = nov.getRow(2).values as unknown[];
    const col = (day: number) => header.indexOf(day);
    const anna = nov.getRow(3);
    expect(anna.getCell(1).value).toBe("Anna");
    expect(anna.getCell(col(2)).value).toBe("X");
    expect(anna.getCell(col(3)).value).toBe("½U");
    expect(anna.getCell(col(5)).value).toBe("F");
    const values = anna.values as unknown[];
    expect(values.slice(-3)).toEqual([1, 0.5, 1]); // Krank, Urlaub, Sonstige

    const dec = wb.getWorksheet("Dezember")!;
    expect(dec.getRow(1).values).toContain("1. Weihnachtstag");
    expect(dec.rowCount).toBe(4);

    const year = wb.getWorksheet("Jahr")!;
    expect(year.getRow(2).values).toEqual([undefined, "Anna", 18, 2, 0, 4.5, 0, 15.5, 3]);

    // It writes a real file.
    const buffer = await wb.xlsx.writeBuffer();
    expect(buffer.byteLength).toBeGreaterThan(1000);
  });
});
