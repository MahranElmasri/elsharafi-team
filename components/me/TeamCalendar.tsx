import { WEEKDAY_SHORT, worksOn } from "@/lib/grid";
import type { MeData } from "@/lib/me-data";

/** "Team": who from the same group is away this month, never why (R11). */
export function TeamCalendar({ data }: { data: MeData }) {
  if (data.team.length === 0) {
    return <p className="text-sm text-ink-2">In Ihrer Gruppe ist sonst niemand eingetragen.</p>;
  }
  return (
    <div className="grid gap-3">
      <p className="text-sm text-ink-2">
        Wer aus der Gruppe {data.profile.teamName} in diesem Monat abwesend ist. Gründe sehen nur
        Sie selbst und die Praxisleitung.
      </p>
      {/* Dates above the day columns (R11); the rows below use the same flex columns. */}
      <div className="flex gap-[2px] text-center leading-tight text-ink-2" aria-hidden>
        {data.columns.map((c) => (
          <span
            key={c.key}
            data-testid="team-date"
            className={`min-w-0 flex-1 rounded-[3px] py-0.5 ${c.holiday ? "bg-[var(--holiday)]" : ""} ${c.isToday ? "font-bold text-ink outline-2 outline-[var(--marker)]" : ""}`}
          >
            <span className="block text-[9px]">{WEEKDAY_SHORT[c.weekday][0]}</span>
            <span className="block text-[9.5px] tracking-[-0.08em] sm:text-[11px] sm:font-semibold sm:tracking-normal">
              {c.day}
            </span>
          </span>
        ))}
      </div>
      <ul className="grid gap-2.5" aria-label="Ihre Gruppe">
        {data.team.map((m) => {
          const absent = new Set(m.absent);
          const person = { workdays: m.workdays, startDate: "0000-01-01", endDate: null };
          return (
            <li key={m.id} className="grid gap-1">
              <b className="text-sm">{m.name}</b>
              <div className="flex gap-[2px]">
                {data.columns.map((c) => {
                  const away = absent.has(c.key);
                  const works = worksOn(person, c);
                  const state = away
                    ? "abwesend"
                    : c.holiday
                      ? c.holiday
                      : works
                        ? "anwesend"
                        : "kein Arbeitstag";
                  const bg = away
                    ? "bg-ink-2"
                    : c.holiday
                      ? "bg-[var(--holiday)]"
                      : works
                        ? "bg-[var(--hatch)]"
                        : "bg-[repeating-linear-gradient(135deg,var(--hatch)_0_3px,transparent_3px_6px)]";
                  return (
                    <i
                      key={c.key}
                      title={`${c.day}.: ${state}`}
                      className={`h-[18px] flex-1 rounded-[3px] ${bg} ${c.isToday ? "outline-2 outline-[var(--marker)]" : ""}`}
                    />
                  );
                })}
              </div>
              <span className="sr-only">
                {m.name}:{" "}
                {m.absent.length
                  ? `abwesend am ${m.absent.map((d) => `${Number(d.slice(8))}.`).join(", ")}`
                  : "diesen Monat nicht abwesend"}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="flex flex-wrap gap-4 text-[13px] text-ink-2" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-[18px] w-[13px] rounded-[3px] bg-ink-2" />
          abwesend
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-[18px] w-[13px] rounded-[3px] bg-[repeating-linear-gradient(135deg,var(--hatch)_0_3px,transparent_3px_6px)]" />
          arbeitet an dem Tag nicht
        </span>
      </p>
    </div>
  );
}
