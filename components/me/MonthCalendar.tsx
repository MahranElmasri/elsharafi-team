import { Stamp } from "@/components/Stamp";
import { stampTilt, WEEKDAY_LONG, WEEKDAY_SHORT, worksOn, type DayColumn } from "@/lib/grid";
import type { MeData } from "@/lib/me-data";

/** "Mein Kalender": the employee's own month, Mon–Fri, same stamps as the admin grid. */
export function MonthCalendar({ data }: { data: MeData }) {
  const first = data.columns[0];
  return (
    <div className="grid grid-cols-5 gap-1 tabular-nums">
      {[1, 2, 3, 4, 5].map((d) => (
        <div key={d} className="text-center text-xs text-ink-2" aria-hidden>
          {WEEKDAY_SHORT[d]}
        </div>
      ))}
      {first &&
        Array.from({ length: first.weekday - 1 }, (_, i) => <div key={`blank-${i}`} aria-hidden />)}
      {data.columns.map((c) => (
        <Day key={c.key} c={c} data={data} />
      ))}
    </div>
  );
}

function Day({ c, data }: { c: DayColumn; data: MeData }) {
  const works = worksOn(data.profile, c);
  const entry = data.entries[c.key];
  const type = entry ? data.types[entry.type] : undefined;
  const half = entry?.half === "am" ? ", vormittags" : entry?.half === "pm" ? ", nachmittags" : "";
  const text = c.holiday
    ? c.holiday
    : !works
      ? "kein Arbeitstag"
      : type
        ? `${type.label}${half}${entry?.status === "pending" ? ", beantragt" : ""}`
        : "frei";
  const cls = [
    "grid min-h-[54px] content-start justify-items-center gap-0.5 rounded-lg border border-rule p-[3px] text-xs",
    c.holiday && "bg-[var(--holiday)] text-krank",
    !c.holiday &&
      !works &&
      "bg-[repeating-linear-gradient(135deg,var(--hatch)_0_4px,transparent_4px_8px)]",
    c.isToday && "border-ink-2 bg-[var(--today)]",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cls} title={text}>
      <span aria-hidden>{c.day}</span>
      <span className="sr-only">
        {WEEKDAY_LONG[c.weekday]} {c.day}.{c.isToday ? " (heute)" : ""}: {text}
      </span>
      {entry && type && (
        <span className="scale-[0.85]">
          <Stamp
            letter={type.letter}
            color={type.color}
            pending={entry.status === "pending"}
            half={entry.half}
            tilt={stampTilt(c.key)}
            showHalfMark={data.settings.halfDays}
          />
        </span>
      )}
      {c.holiday && (
        <small aria-hidden className="text-center text-[9px] leading-tight">
          {c.holiday.length > 12 ? "Feiertag" : c.holiday}
        </small>
      )}
    </div>
  );
}
