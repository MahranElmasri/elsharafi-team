"use client";

import { useState, useTransition } from "react";
import { withdrawRequest } from "@/app/actions/me";
import { FormMessage } from "@/components/FormMessage";
import { Stamp } from "@/components/Stamp";
import { formatDays, formatRange } from "@/lib/dates";
import type { MeData } from "@/lib/me-data";

const STATUS = {
  pending: "Beantragt",
  approved: "Genehmigt",
  denied: "Abgelehnt",
  cancelled: "Zurückgezogen",
} as const;

/** "Meine Anträge": newest first, pending ones can be withdrawn. */
export function RequestList({ data }: { data: MeData }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ error?: string; ok?: string }>({});

  if (data.requests.length === 0) {
    return (
      <p className="text-sm text-ink-2">
        Noch keine Anträge für {data.year}. Tippen Sie auf „Urlaub beantragen“.
      </p>
    );
  }
  return (
    <div className="grid gap-2">
      <FormMessage {...message} />
      <ul className="grid gap-2">
        {data.requests.map((r) => {
          const t = data.types[r.type];
          const live = r.status === "pending" || r.status === "approved";
          return (
            <li
              key={r.id}
              className="flex items-center gap-3 rounded-[10px] border border-rule p-2.5"
            >
              {t && <Stamp letter={t.letter} color={t.color} pending={r.status !== "approved"} />}
              <div className="min-w-0 flex-1">
                <b className="block">
                  {t?.label ?? r.type}, {formatRange(r.startDate, r.endDate)}
                </b>
                <span className="text-[13px] text-ink-2">
                  {live && `${formatDays(r.days)} ${r.days === 1 ? "Arbeitstag" : "Arbeitstage"}`}
                  {r.substitute && `${live ? ". " : ""}Vertretung: ${r.substitute}`}
                  {r.decisionNote && `. ${r.decisionNote}`}
                </span>
                {r.status === "pending" && (
                  <button
                    type="button"
                    disabled={pending}
                    className="btn-plain block text-sm"
                    onClick={() => start(async () => setMessage(await withdrawRequest(r.id)))}
                  >
                    Antrag zurückziehen
                  </button>
                )}
              </div>
              <span
                className={`rounded-md px-[7px] py-[2px] text-xs font-extrabold whitespace-nowrap ${
                  r.status === "pending"
                    ? "border-[1.5px] border-dashed border-pencil text-ink-2"
                    : r.status === "approved"
                      ? "bg-ink text-on-ink"
                      : "border border-rule text-ink-2"
                }`}
              >
                {STATUS[r.status]}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
