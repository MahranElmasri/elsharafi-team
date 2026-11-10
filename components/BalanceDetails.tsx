import { Fragment } from "react";
import { formatDays } from "@/lib/dates";
import type { MyBalance, TypeInfo } from "@/lib/me-data";

export const dayCount = (n: number) => `${formatDays(n)} ${n === 1 ? "Tag" : "Tage"}`;

/** Every R12 figure for one person and year. */
export function BalanceFigures({
  balance: b,
  types,
}: {
  balance: MyBalance;
  types: Record<string, TypeInfo>;
}) {
  const others = Object.entries(b.byType).filter(
    ([code, n]) =>
      n > 0 && !types[code]?.deductsVacation && code !== "sick" && code !== "child_sick",
  );
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 tabular-nums">
      <dt>Anspruch</dt>
      <dd>{dayCount(b.allowance)}</dd>
      <dt>Aus dem Vorjahr</dt>
      <dd>{dayCount(b.carryover)}</dd>
      {b.carryover > 0 && (
        <>
          <dt className="pl-3 text-ink-2">davon bis 31.3. genommen</dt>
          <dd>{dayCount(b.carryoverUsed)}</dd>
          <dt className="pl-3 text-ink-2">davon verfallen</dt>
          <dd>{dayCount(b.carryoverExpired)}</dd>
        </>
      )}
      <dt>Genommen</dt>
      <dd>{dayCount(b.taken)}</dd>
      <dt>Beantragt</dt>
      <dd>{dayCount(b.pending)}</dd>
      <dt className="font-bold">Noch verfügbar</dt>
      <dd className="font-bold">{dayCount(b.available)}</dd>
      <dt>Krankheitstage</dt>
      <dd>{dayCount(b.sick)}</dd>
      {others.map(([code, n]) => (
        <Fragment key={code}>
          <dt>{types[code]?.label ?? code}</dt>
          <dd>{dayCount(n)}</dd>
        </Fragment>
      ))}
    </dl>
  );
}
