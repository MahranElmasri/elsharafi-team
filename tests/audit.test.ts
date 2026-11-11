import { describe as group, expect, it } from "vitest";
import { changes, describe, personOf, type AuditEntry } from "@/lib/audit";

const lookup = {
  names: { u1: "Anna Berger", u2: "Lena Brandt", boss: "Praxis Leitung" },
  types: { sick: "Krank", vacation: "Urlaub" },
};

const entry = (e: Partial<AuditEntry>): AuditEntry => ({
  id: 1,
  actor: "boss",
  table_name: "absence_days",
  row_key: "u1|2026-11-17",
  action: "INSERT",
  old: null,
  new: null,
  at: "2026-11-11T09:00:00Z",
  ...e,
});

group("audit display", () => {
  it("shows a new absence with its content", () => {
    const e = entry({
      new: {
        user_id: "u1",
        day: "2026-11-17",
        type: "sick",
        status: "approved",
        half: null,
        amount: 1,
        au_received: false,
      },
    });
    expect(personOf(e)).toBe("u1");
    expect(describe(e, lookup)).toBe("Anna Berger, 17.11.2026: angelegt");
    expect(changes(e, lookup)).toEqual([
      { field: "Art", before: null, after: "Krank" },
      { field: "Status", before: null, after: "genehmigt" },
      { field: "Menge", before: null, after: "1" },
      { field: "AU liegt vor", before: null, after: "nein" },
    ]);
  });

  it("lists only the fields that changed", () => {
    const e = entry({
      table_name: "leave_requests",
      row_key: "r1",
      action: "UPDATE",
      old: {
        id: "r1",
        user_id: "u1",
        type: "vacation",
        start_date: "2026-12-07",
        end_date: "2026-12-09",
        status: "pending",
        decided_by: null,
        decided_at: null,
      },
      new: {
        id: "r1",
        user_id: "u1",
        type: "vacation",
        start_date: "2026-12-07",
        end_date: "2026-12-09",
        status: "approved",
        decided_by: "boss",
        decided_at: "2026-11-11T09:00:00Z",
      },
    });
    expect(describe(e, lookup)).toBe("Antrag Urlaub 7.12.2026–9.12.2026, Anna Berger: geändert");
    expect(changes(e, lookup)).toEqual([
      { field: "Status", before: "beantragt", after: "genehmigt" },
      { field: "Entschieden von", before: "–", after: "Praxis Leitung" },
    ]);
  });

  it("reads workdays, roles and the retention summary", () => {
    const e = entry({
      table_name: "profiles",
      row_key: "u2",
      action: "UPDATE",
      old: { id: "u2", workdays: [1, 2, 3, 4, 5], role: "employee" },
      new: { id: "u2", workdays: [1, 2, 4], role: "admin" },
    });
    expect(describe(e, lookup)).toBe("Lena Brandt: geändert");
    expect(changes(e, lookup)).toEqual([
      { field: "Arbeitstage", before: "Mo, Di, Mi, Do, Fr", after: "Mo, Di, Do" },
      { field: "Rolle", before: "Mitarbeiter/in", after: "Praxisleitung" },
    ]);
    const purge = entry({
      table_name: "absence_days",
      row_key: "retention",
      action: "DELETE",
      actor: null,
      old: { deleted_days: 12, before: "2023-01-01" },
    });
    expect(describe(purge, lookup)).toBe("Löschfrist für Gesundheitsdaten (automatisch)");
    expect(changes(purge, lookup)).toEqual([
      { field: "Gelöscht", before: null, after: "12 Gesundheitsdaten-Tage vor dem 1.1.2023" },
    ]);
  });
});
