// Display helpers only. Counting rules (working days, holidays, balances) live in SQL.

/** "2026-11-17" for a local date. */
export function toKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Local date from "2026-11-17". */
export function fromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const short = (d: Date) => `${d.getDate()}.${d.getMonth() + 1}.`;

/** German short range: "17.11.", "17.–18.11.", "30.11.–4.12." */
export function formatRange(from: string, to: string): string {
  const a = fromKey(from);
  const b = fromKey(to);
  if (from === to) return short(a);
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
    return `${a.getDate()}.–${short(b)}`;
  }
  return `${short(a)}–${short(b)}`;
}

/** German number: 0.5 → "0,5". */
export function formatDays(n: number): string {
  return n.toLocaleString("de-DE", { maximumFractionDigits: 1 });
}
