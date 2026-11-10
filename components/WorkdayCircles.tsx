import { WEEKDAYS } from "@/lib/employees";

/** The appointment-card motif: Mo–Fr circles, filled on the days the person works. */
export function WorkdayCircles({ workdays }: { workdays: number[] }) {
  const works = WEEKDAYS.filter((d) => workdays.includes(d.n));
  return (
    <span
      className="inline-flex gap-1"
      role="img"
      aria-label={`Arbeitet ${works.map((d) => d.short).join(", ")}`}
    >
      {WEEKDAYS.map((d) => {
        const on = workdays.includes(d.n);
        return (
          <span
            key={d.n}
            aria-hidden
            className={`grid size-6 place-items-center rounded-full border text-[0.65rem] font-bold ${
              on ? "border-ink bg-ink text-on-ink" : "border-pencil text-pencil"
            }`}
          >
            {d.short}
          </span>
        );
      })}
    </span>
  );
}
