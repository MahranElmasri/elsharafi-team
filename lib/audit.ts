// Display helpers for the audit log (R20). The log itself is written by database triggers.

export interface AuditEntry {
  id: number;
  actor: string | null;
  table_name: string;
  row_key: string;
  action: "INSERT" | "UPDATE" | "DELETE";
  old: Record<string, unknown> | null;
  new: Record<string, unknown> | null;
  at: string;
}

export interface Lookup {
  names: Record<string, string>; // profile id → name
  types: Record<string, string>; // type code → label
}

export const AREAS: Record<string, string> = {
  absence_days: "Abwesenheiten",
  leave_requests: "Anträge",
  leave_allowances: "Urlaubsanspruch",
  closure_days: "Schließungen",
  profiles: "Mitarbeitende",
  app_settings: "Einstellungen",
  absence_types: "Abwesenheitsarten",
  teams: "Gruppen",
  notify_recipients: "E-Mail-Empfänger",
};

const ACTION = { INSERT: "angelegt", UPDATE: "geändert", DELETE: "gelöscht" } as const;

const FIELDS: Record<string, string> = {
  type: "Art",
  status: "Status",
  half: "Halber Tag",
  amount: "Menge",
  au_received: "AU liegt vor",
  note: "Notiz",
  days: "Tage",
  carryover: "Übertrag",
  full_name: "Name",
  username: "Benutzername",
  notify_email: "E-Mail",
  email: "E-Mail",
  role: "Rolle",
  team_id: "Gruppe",
  active: "Aktiv",
  workdays: "Arbeitstage",
  start_date: "Beginn",
  end_date: "Ende",
  start_half: "Erster Tag",
  end_half: "Letzter Tag",
  substitute_id: "Vertretung",
  decided_by: "Entschieden von",
  decision_note: "Nachricht",
  max_absent: "Höchstens abwesend",
  label: "Bezeichnung",
  letter: "Zeichen",
  color: "Farbe",
  visible: "Sichtbar",
  entry_mode: "Eingetragen von",
  deducts_vacation: "Zieht Urlaub ab",
  is_health: "Gesundheitsdaten",
  limit_days: "Grenze (Tage)",
  limit_years: "Grenze (Jahre)",
  team_calendar: "Teamkalender",
  half_days: "Halbe Tage",
  substitutes: "Vertretung",
  au_tracking: "AU-Nachverfolgung",
  name: "Name",
};

// Keys and bookkeeping columns that say nothing a reader needs.
const HIDDEN = new Set([
  "id",
  "user_id",
  "day",
  "year",
  "code",
  "request_id",
  "created_at",
  "created_by",
  "decided_at",
  "sort",
]);

const STATUS: Record<string, string> = {
  pending: "beantragt",
  approved: "genehmigt",
  denied: "abgelehnt",
  cancelled: "storniert",
};
const HALF: Record<string, string> = { am: "vormittags", pm: "nachmittags" };
const WEEKDAY = ["", "Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const ROLE: Record<string, string> = { admin: "Praxisleitung", employee: "Mitarbeiter/in" };

/** "2026-11-17" → "17.11.2026" */
export function formatDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return `${d}.${m}.${y}`;
}

function formatValue(field: string, value: unknown, lookup: Lookup): string {
  if (value === null || value === undefined || value === "") return "–";
  if (typeof value === "boolean") return value ? "ja" : "nein";
  if (field === "type") return lookup.types[String(value)] ?? String(value);
  if (field === "status") return STATUS[String(value)] ?? String(value);
  if (field === "half" || field === "start_half" || field === "end_half") {
    return HALF[String(value)] ?? String(value);
  }
  if (field === "role") return ROLE[String(value)] ?? String(value);
  if (field === "workdays" && Array.isArray(value)) {
    return value.map((d) => WEEKDAY[Number(d)]).join(", ");
  }
  if (field === "substitute_id" || field === "decided_by") {
    return lookup.names[String(value)] ?? "unbekannt";
  }
  if (typeof value === "number") return value.toLocaleString("de-DE");
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDate(value);
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

/** The person a row is about, if any. */
export function personOf(e: AuditEntry): string | null {
  const row = e.new ?? e.old ?? {};
  if (typeof row.user_id === "string") return row.user_id;
  if (e.table_name === "profiles" && typeof row.id === "string") return row.id;
  return null;
}

/** "Abwesenheit, Anna Berger, 17.11.2026, angelegt" */
export function describe(e: AuditEntry, lookup: Lookup): string {
  const row = e.new ?? e.old ?? {};
  const who = personOf(e);
  const name = who ? (lookup.names[who] ?? "gelöschte Person") : null;
  const action = ACTION[e.action];
  if (e.row_key === "retention") return "Löschfrist für Gesundheitsdaten (automatisch)";
  switch (e.table_name) {
    case "absence_days":
      return `${name}, ${formatDate(String(row.day))}: ${action}`;
    case "leave_requests":
      return `Antrag ${lookup.types[String(row.type)] ?? row.type} ${formatDate(String(row.start_date))}–${formatDate(String(row.end_date))}, ${name}: ${action}`;
    case "leave_allowances":
      return `${name}, ${row.year}: ${action}`;
    case "profiles":
      return `${name}: ${action}`;
    case "closure_days":
      return `${formatDate(String(row.day))}: ${action}`;
    case "absence_types":
      return `${row.label ?? row.code}: ${action}`;
    case "teams":
      return `${row.name ?? row.id}: ${action}`;
    case "notify_recipients":
      return `${row.email}: ${action}`;
    default:
      return action;
  }
}

export interface Change {
  field: string;
  before: string | null; // null: the row was created
  after: string | null; // null: the row was deleted
}

/** The fields that changed (UPDATE) or the row's content (INSERT, DELETE). */
export function changes(e: AuditEntry, lookup: Lookup): Change[] {
  // Retention leaves one summary row in place of the deleted ones (R20).
  if (e.row_key === "retention") {
    const n = Number(e.old?.deleted_days ?? 0);
    const before = String(e.old?.before ?? "");
    return [
      {
        field: "Gelöscht",
        before: null,
        after: `${n} Gesundheitsdaten-Tage vor dem ${before ? formatDate(before) : "–"}`,
      },
    ];
  }
  const keys = new Set([...Object.keys(e.old ?? {}), ...Object.keys(e.new ?? {})]);
  const out: Change[] = [];
  for (const key of keys) {
    if (HIDDEN.has(key)) continue;
    const a = e.old?.[key];
    const b = e.new?.[key];
    if (e.action === "UPDATE" && JSON.stringify(a) === JSON.stringify(b)) continue;
    if (e.action !== "UPDATE" && (a ?? b) === null) continue;
    out.push({
      field: FIELDS[key] ?? key,
      before: e.action === "INSERT" ? null : formatValue(key, a, lookup),
      after: e.action === "DELETE" ? null : formatValue(key, b, lookup),
    });
  }
  return out;
}
