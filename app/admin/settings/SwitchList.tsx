"use client";

import { useOptimistic, useState, useTransition } from "react";
import { setSwitch, type FormState } from "@/app/actions/settings";
import { FormMessage } from "@/components/FormMessage";
import { SWITCHES, type Settings } from "@/lib/settings";

/** The four practice-wide switches; each saves on click. */
export function SwitchList({ settings }: { settings: Settings }) {
  const [shown, setShown] = useOptimistic(settings);
  const [message, setMessage] = useState<FormState>({});
  const [, start] = useTransition();
  return (
    <div className="grid gap-3">
      <ul className="grid gap-3">
        {SWITCHES.map((s) => {
          const on = shown[s.key];
          const hintId = `switch-${s.key}`;
          return (
            <li key={s.key} className="flex items-start justify-between gap-4">
              <div>
                <span className="font-bold">{s.label}</span>
                <p id={hintId} className="text-sm text-ink-2">
                  {s.hint}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={s.label}
                aria-describedby={hintId}
                onClick={() =>
                  start(async () => {
                    setShown({ ...shown, [s.key]: !on });
                    setMessage(await setSwitch(s.key, !on));
                  })
                }
                className={`relative h-7 w-12 shrink-0 rounded-full border-2 border-ink transition-colors ${on ? "bg-ink" : "bg-sheet"}`}
              >
                <span
                  aria-hidden
                  className={`absolute top-0.5 size-5 rounded-full transition-[left] ${on ? "left-[22px] bg-on-ink" : "left-0.5 bg-ink"}`}
                />
              </button>
            </li>
          );
        })}
      </ul>
      <FormMessage {...message} />
      <p className="text-[13px] text-ink-2">
        Ausschalten löscht nichts. Beim Wiedereinschalten ist alles wie vorher.
      </p>
    </div>
  );
}
