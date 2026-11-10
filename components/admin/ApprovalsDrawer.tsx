"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { setAu } from "@/app/actions/grid";
import { decideRequest } from "@/app/actions/requests";
import { FormMessage } from "@/components/FormMessage";
import { Stamp } from "@/components/Stamp";
import { formatDays, formatRange } from "@/lib/dates";
import { groupDays } from "@/lib/grid";
import type { ApprovalsData, PendingRequest } from "@/lib/requests-data";

/** The grid asks the drawer to show one request: `openRequest(id)`. */
export const OPEN_REQUEST = "open-request";
export function openRequest(id: string) {
  window.dispatchEvent(new CustomEvent(OPEN_REQUEST, { detail: id }));
}

type View = "requests" | "au";

/** "Offene Anträge" and "AU fehlt" as a drawer from the right, so the grid keeps its width. */
export function ApprovalsDrawer({ data }: { data: ApprovalsData }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState<View>("requests");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ error?: string; ok?: string }>({});

  function open(next: View, id: string | null = null) {
    setView(next);
    setFocusId(id);
    setMessage({});
    if (!ref.current?.open) ref.current?.showModal();
  }

  useEffect(() => {
    const handler = (e: Event) => open("requests", (e as CustomEvent<string>).detail);
    window.addEventListener(OPEN_REQUEST, handler);
    return () => window.removeEventListener(OPEN_REQUEST, handler);
  }, []);

  useEffect(() => {
    if (!focusId) return;
    document.getElementById(`req-${focusId}`)?.scrollIntoView({ block: "nearest" });
  }, [focusId, view]);

  const count = data.requests.length;
  const badge = (n: number) => (
    <span
      className={`ml-1.5 inline-grid min-w-6 place-items-center rounded-full px-1.5 text-sm ${
        n ? "bg-krank text-on-ink" : "bg-[var(--hatch)] text-ink-2"
      }`}
    >
      {n}
    </span>
  );

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-ink inline-flex items-center"
          onClick={() => open("requests")}
        >
          Offene Anträge {badge(count)}
        </button>
        {data.auTracking && (
          <button
            type="button"
            className="inline-flex items-center rounded-md border border-ink bg-sheet px-4 py-[0.7rem] font-bold"
            onClick={() => open("au")}
          >
            AU fehlt {badge(data.missingAu.length)}
          </button>
        )}
      </div>
      <dialog
        ref={ref}
        aria-labelledby="drawer-h"
        className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-[min(440px,100vw)] overflow-auto border-l border-rule bg-paper p-5 text-ink backdrop:bg-[rgba(29,43,52,0.32)]"
        onClick={(e) => e.target === ref.current && ref.current?.close()}
      >
        <div className="grid content-start gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 id="drawer-h" className="text-2xl font-extrabold tracking-tight">
              {view === "requests" ? "Offene Anträge" : "AU fehlt"}
            </h2>
            <button
              type="button"
              aria-label="Schließen"
              className="grid size-9 place-items-center rounded-full border border-rule bg-sheet text-xl"
              onClick={() => ref.current?.close()}
            >
              ×
            </button>
          </div>
          <FormMessage {...message} />
          {view === "requests" ? (
            count === 0 ? (
              <p className="text-ink-2">
                Keine offenen Anträge. Neue Anträge erscheinen hier, sobald jemand etwas beantragt.
              </p>
            ) : (
              data.requests.map((r) => (
                <RequestCard
                  key={r.id}
                  r={r}
                  data={data}
                  focused={r.id === focusId}
                  onDone={setMessage}
                />
              ))
            )
          ) : (
            <MissingAuList data={data} onDone={setMessage} />
          )}
        </div>
      </dialog>
    </>
  );
}

function RequestCard({
  r,
  data,
  focused,
  onDone,
}: {
  r: PendingRequest;
  data: ApprovalsData;
  focused: boolean;
  onDone: (m: { error?: string; ok?: string }) => void;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [note, setNote] = useState("");
  const t = data.types[r.type];
  const span = `${formatRange(r.startDate, r.endDate)}${r.endDate.slice(0, 4)}`;
  const warnings = [
    ...r.conflicts.map(
      (c) =>
        `${c.name}: ${data.types[c.type]?.label ?? c.type} ${groupDays(c.days)}${c.status === "pending" ? " (beantragt)" : ""}`,
    ),
    ...(r.overLimit.length
      ? [
          `Zu viele aus der Gruppe abwesend: ${r.overLimit
            .map((o) => `${groupDays([o.day])} (${o.absent} von ${o.max})`)
            .join(", ")}`,
        ]
      : []),
    ...(r.typeLimit
      ? [
          `${t?.label}: ${formatDays(r.typeLimit.used)} von ${formatDays(r.typeLimit.limit)} Tagen genutzt (${formatRange(r.typeLimit.from, r.typeLimit.to)}${r.typeLimit.to.slice(0, 4)})`,
        ]
      : []),
  ];

  function decide(approve: boolean) {
    start(async () => {
      const res = await decideRequest(r.id, approve, note);
      onDone(
        res.error
          ? res
          : {
              ok: `${approve ? "Genehmigt" : "Abgelehnt"}: ${r.name}, ${formatRange(r.startDate, r.endDate)}`,
            },
      );
      router.refresh();
    });
  }

  return (
    <article
      id={`req-${r.id}`}
      aria-labelledby={`req-h-${r.id}`}
      className={`grid gap-2.5 rounded-xl border border-rule bg-sheet p-3.5 ${
        focused ? "outline-3 outline-[var(--marker)]" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        {t && <Stamp letter={t.letter} color={t.color} pending />}
        <div className="grid gap-0.5 text-ink-2">
          <h3 id={`req-h-${r.id}`} className="text-[17px] font-bold text-ink">
            {r.name}
          </h3>
          <p>
            {t?.label ?? r.type}, {span}, {formatDays(r.days)}{" "}
            {r.days === 1 ? "Arbeitstag" : "Arbeitstage"}
          </p>
          {r.remainingAfter !== null && (
            <p className={r.remainingAfter < 0 ? "font-bold text-krank" : ""}>
              Danach {formatDays(r.remainingAfter)} Tage Resturlaub
            </p>
          )}
          {r.substitute && <p>Vertretung: {r.substitute}</p>}
          {r.note && <p>Notiz: {r.note}</p>}
        </div>
      </div>
      {warnings.length ? (
        <ul
          aria-label="Warnungen"
          className="grid gap-1.5 rounded-lg bg-[color-mix(in_srgb,var(--krank)_8%,transparent)] px-3 py-2.5 text-sm"
        >
          {warnings.map((w) => (
            <li key={w} className="relative pl-[22px]">
              <span
                aria-hidden
                className="absolute top-px left-0 grid size-4 place-items-center rounded-full bg-krank text-[11px] font-extrabold text-on-ink"
              >
                !
              </span>
              {w}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm font-bold text-[var(--green)]">
          Keine Überschneidungen in der Gruppe.
        </p>
      )}
      <label className="grid gap-1 text-sm text-ink-2">
        Nachricht an {r.name} (freiwillig)
        <input
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
          className="field text-ink"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} className="btn-ink" onClick={() => decide(true)}>
          Genehmigen
        </button>
        <button
          type="button"
          disabled={busy}
          className="rounded-md border border-ink bg-sheet px-4 py-[0.7rem] font-bold disabled:opacity-60"
          onClick={() => decide(false)}
        >
          Ablehnen
        </button>
      </div>
    </article>
  );
}

function MissingAuList({
  data,
  onDone,
}: {
  data: ApprovalsData;
  onDone: (m: { error?: string; ok?: string }) => void;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  if (data.missingAu.length === 0) {
    return (
      <p className="text-ink-2">Für alle Krankmeldungen über 3 Kalendertage liegt eine AU vor.</p>
    );
  }
  return (
    <>
      <p className="text-sm text-ink-2">
        Krankheitszeiten über 3 Kalendertage, für die noch keine AU vorliegt.
      </p>
      <ul className="grid gap-2">
        {data.missingAu.map((m) => (
          <li
            key={`${m.userId}|${m.startDate}`}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rule bg-sheet p-3"
          >
            <div>
              <b className="block">{m.name}</b>
              <span className="text-sm text-ink-2">
                {formatRange(m.startDate, m.endDate)}
                {m.endDate.slice(0, 4)}, {m.missing} {m.missing === 1 ? "Tag" : "Tage"} ohne AU
              </span>
            </div>
            <button
              type="button"
              disabled={busy}
              className="btn-plain"
              onClick={() =>
                start(async () => {
                  const res = await setAu(m.userId, m.startDate, true);
                  onDone(
                    res.error
                      ? res
                      : { ok: `AU liegt vor: ${m.name}, ${res.days} Krankheitstage.` },
                  );
                  router.refresh();
                })
              }
            >
              AU liegt vor
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
