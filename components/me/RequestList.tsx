"use client";

import { useState, useTransition } from "react";
import { withdrawRequest } from "@/app/actions/me";
import { cancelRequest } from "@/app/actions/requests";
import { FormMessage } from "@/components/FormMessage";
import { Stamp } from "@/components/Stamp";
import { formatDays, formatRange } from "@/lib/dates";
import type { MyRequest, TypeInfo } from "@/lib/me-data";

const STATUS = {
  pending: "Beantragt",
  approved: "Genehmigt",
  denied: "Abgelehnt",
  cancelled: "Zurückgezogen",
} as const;

/**
 * Requests, newest first. "own": the employee withdraws pending ones.
 * "admin": the practice cancels pending or approved ones, with an optional message (R9).
 */
export function RequestList({
  requests,
  types,
  year,
  mode,
}: {
  requests: MyRequest[];
  types: Record<string, TypeInfo>;
  year: number;
  mode: "own" | "admin";
}) {
  const [busy, start] = useTransition();
  const [message, setMessage] = useState<{ error?: string; ok?: string }>({});
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [note, setNote] = useState("");

  if (requests.length === 0) {
    return (
      <p className="text-sm text-ink-2">
        {mode === "own"
          ? `Noch keine Anträge für ${year}. Tippen Sie auf „Urlaub beantragen“.`
          : `Keine Anträge für ${year}.`}
      </p>
    );
  }
  return (
    <div className="grid gap-2">
      <FormMessage {...message} />
      <ul className="grid gap-2" aria-label={`Anträge ${year}`}>
        {requests.map((r) => {
          const t = types[r.type];
          const live = r.status === "pending" || r.status === "approved";
          const canCancel = mode === "admin" ? live : r.status === "pending";
          return (
            <li key={r.id} className="grid gap-2 rounded-[10px] border border-rule p-2.5">
              <div className="flex items-center gap-3">
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
                  {canCancel && cancelling !== r.id && (
                    <button
                      type="button"
                      disabled={busy}
                      className="btn-plain block text-sm"
                      onClick={() => {
                        setMessage({});
                        if (mode === "own") {
                          start(async () => setMessage(await withdrawRequest(r.id)));
                        } else {
                          setNote("");
                          setCancelling(r.id);
                        }
                      }}
                    >
                      {mode === "own" ? "Antrag zurückziehen" : "Stornieren"}
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
                  {r.status === "cancelled" && mode === "admin" ? "Storniert" : STATUS[r.status]}
                </span>
              </div>
              {cancelling === r.id && (
                <form
                  className="grid gap-2 border-t border-rule pt-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    start(async () => {
                      const res = await cancelRequest(r.id, note);
                      setMessage(res);
                      if (!res.error) setCancelling(null);
                    });
                  }}
                >
                  <p className="text-sm">
                    Die {r.status === "approved" ? "genehmigten" : "beantragten"} Tage werden
                    gelöscht und die Person wird benachrichtigt.
                  </p>
                  <label className="grid gap-1 text-sm">
                    Nachricht (freiwillig)
                    <input
                      value={note}
                      maxLength={500}
                      onChange={(e) => setNote(e.target.value)}
                      className="field"
                    />
                  </label>
                  <div className="flex gap-3">
                    <button type="submit" disabled={busy} className="btn-ink">
                      Stornieren
                    </button>
                    <button type="button" className="btn-plain" onClick={() => setCancelling(null)}>
                      Abbrechen
                    </button>
                  </div>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
