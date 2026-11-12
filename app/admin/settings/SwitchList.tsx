"use client";

import { useOptimistic, useState, useTransition } from "react";
import { setSwitch, type FormState } from "@/app/actions/settings";
import { FormMessage } from "@/components/FormMessage";
import { Switch } from "@/components/Switch";
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
              <Switch
                on={on}
                label={s.label}
                describedBy={hintId}
                onToggle={() =>
                  start(async () => {
                    setShown({ ...shown, [s.key]: !on });
                    setMessage(await setSwitch(s.key, !on));
                  })
                }
              />
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
