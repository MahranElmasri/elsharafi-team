"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { reportSick, requestLeave, type MeActionState } from "@/app/actions/me";
import { FormMessage } from "@/components/FormMessage";
import type { MeData } from "@/lib/me-data";

/** "Urlaub beantragen" and "Krank melden", each as a dialog form. */
export function MeActions({ data, today }: { data: MeData; today: string }) {
  const [notice, setNotice] = useState<string>();
  return (
    <div className="grid gap-2">
      <div className="grid gap-2 sm:grid-cols-2">
        {data.requestTypes.length > 0 && (
          <FormDialog
            open="Urlaub beantragen"
            title="Abwesenheit beantragen"
            action={requestLeave}
            submit="Beantragen"
            primary
            onDone={setNotice}
          >
            <RequestFields data={data} today={today} />
          </FormDialog>
        )}
        {data.reportTypes.length > 0 && (
          <FormDialog
            open="Krank melden"
            title="Krank melden"
            action={reportSick}
            submit="Krank melden"
            onDone={setNotice}
          >
            <SickFields data={data} today={today} />
          </FormDialog>
        )}
      </div>
      <FormMessage ok={notice} />
    </div>
  );
}

function FormDialog({
  open,
  title,
  action,
  submit,
  primary = false,
  onDone,
  children,
}: {
  open: string;
  title: string;
  action: (prev: MeActionState, form: FormData) => Promise<MeActionState>;
  submit: string;
  primary?: boolean;
  onDone: (message?: string) => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const [state, formAction, pending] = useActionState(action, {});
  const [key, setKey] = useState(0); // fresh fields each time the dialog opens

  useEffect(() => {
    if (!state.done) return;
    ref.current?.close();
    onDone(state.ok);
  }, [state.done, state.ok, onDone]);

  const btn = "justify-center rounded-[10px] px-3.5 py-3 text-base font-bold";
  return (
    <>
      <button
        type="button"
        className={`${btn} ${primary ? "bg-ink text-on-ink" : "border border-ink bg-sheet"}`}
        onClick={() => {
          setKey((k) => k + 1);
          onDone(undefined);
          ref.current?.showModal();
        }}
      >
        {open}
      </button>
      <dialog
        ref={ref}
        aria-labelledby={headingId}
        className="m-auto w-[min(440px,calc(100vw-24px))] rounded-2xl border border-rule bg-sheet p-0 text-ink backdrop:bg-[rgba(29,43,52,0.45)]"
      >
        <form key={key} action={formAction} className="grid gap-3.5 p-5" noValidate>
          <h2 id={headingId} className="text-xl font-extrabold">
            {title}
          </h2>
          {children}
          {state.error && !pending && <FormMessage error={state.error} />}
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={pending} className="btn-ink">
              {pending ? "Senden …" : submit}
            </button>
            <button type="button" className="btn-plain" onClick={() => ref.current?.close()}>
              Abbrechen
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

const label = "grid min-w-0 gap-1 text-sm font-medium";
const check = "flex items-center gap-2 text-sm";

function DateFields({ today, toLabel }: { today: string; toLabel: string }) {
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className={label}>
        Von
        <input
          name="from"
          type="date"
          required
          className="field w-full min-w-0"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            if (to < e.target.value) setTo(e.target.value);
          }}
        />
      </label>
      <label className={label}>
        {toLabel}
        <input
          name="to"
          type="date"
          required
          min={from}
          className="field w-full min-w-0"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </label>
    </div>
  );
}

function RequestFields({ data, today }: { data: MeData; today: string }) {
  return (
    <>
      <label className={label}>
        Art
        <select name="type" className="field" defaultValue={data.requestTypes[0]}>
          {data.requestTypes.map((code) => (
            <option key={code} value={code}>
              {data.types[code].label}
            </option>
          ))}
        </select>
      </label>
      <DateFields today={today} toLabel="Bis" />
      {data.settings.halfDays && (
        <div className="grid gap-1.5">
          <label className={check}>
            <input type="checkbox" name="startHalf" className="size-4" />
            Am ersten Tag erst ab mittags frei
          </label>
          <label className={check}>
            <input type="checkbox" name="endHalf" className="size-4" />
            Am letzten Tag nur vormittags frei
          </label>
        </div>
      )}
      <SubstituteField data={data} />
      <label className={label}>
        Notiz an die Praxisleitung (freiwillig)
        <textarea name="note" rows={2} maxLength={500} className="field" />
      </label>
      <p className="text-[13px] text-ink-2">
        Gezählt werden nur Ihre Arbeitstage. Feiertage zählen nicht.
      </p>
    </>
  );
}

/** Optional colleague from the same group (R7, R8); told on approval, or at once for a sick report. */
function SubstituteField({ data }: { data: MeData }) {
  if (!data.settings.substitutes || data.team.length === 0) return null;
  return (
    <label className={label}>
      Vertretung (freiwillig)
      <select name="substitute" className="field" defaultValue="">
        <option value="">Keine</option>
        {data.team.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function SickFields({ data, today }: { data: MeData; today: string }) {
  return (
    <>
      <fieldset className="grid gap-2">
        <legend className="mb-1.5 text-sm text-ink-2">Wer ist krank?</legend>
        {data.reportTypes.map((code, i) => (
          <label key={code} className={check}>
            <input
              type="radio"
              name="type"
              value={code}
              defaultChecked={i === 0}
              className="size-4"
            />
            {code === "sick" ? "Ich bin krank" : data.types[code].label}
          </label>
        ))}
      </fieldset>
      <DateFields today={today} toLabel="Bis voraussichtlich" />
      <SubstituteField data={data} />
      <label className={label}>
        Notiz an die Praxisleitung (freiwillig)
        <textarea name="note" rows={2} maxLength={500} className="field" />
      </label>
      {data.settings.auTracking && (
        <p className="text-[13px] text-ink-2">
          Dauert es länger als 3 Kalendertage, reichen Sie bitte die AU bei der Praxisleitung ein.
        </p>
      )}
      <p className="text-[13px] text-ink-2">
        Die Praxisleitung wird sofort benachrichtigt. Kolleginnen und Kollegen sehen nur „abwesend“.
      </p>
    </>
  );
}
