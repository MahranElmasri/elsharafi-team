"use client";

import { useEffect, useState, useTransition } from "react";
import { FormMessage } from "@/components/FormMessage";
import { Switch } from "@/components/Switch";
import {
  pushConfigured,
  readPushState,
  turnPushOff,
  turnPushOn,
  type PushState,
} from "@/lib/push-client";

const WHY_NOT: Partial<Record<PushState, string>> = {
  unsupported:
    "Dieser Browser kann keine Push-Meldungen empfangen. Meldungen kommen hier und per E-Mail.",
  "ios-install":
    "Push auf dem iPhone: Tippen Sie auf „Teilen“ → „Zum Home-Bildschirm“ und öffnen Sie die App von dort.",
  denied:
    "Mitteilungen sind für diese Seite blockiert. Erlauben Sie sie in den Einstellungen des Browsers.",
};

/** "Auf diesem Gerät benachrichtigen": push for this device, or why it isn't possible (R27). */
export function PushToggle() {
  const [state, setState] = useState<PushState | null>(null);
  const [error, setError] = useState<string>();
  const [busy, start] = useTransition();

  useEffect(() => {
    if (!pushConfigured) return;
    readPushState()
      .then(setState)
      .catch(() => setState("unsupported"));
  }, []);

  if (!pushConfigured || state === null) return null;
  const why = WHY_NOT[state];
  return (
    <div className="grid gap-1 border-b border-rule px-2 pb-2">
      {why ? (
        <p className="text-xs text-ink-2">{why}</p>
      ) : (
        <span className="flex items-center justify-between gap-3 text-sm">
          Auf diesem Gerät benachrichtigen
          <Switch
            on={state === "on"}
            label="Auf diesem Gerät benachrichtigen"
            disabled={busy}
            onToggle={() =>
              start(async () => {
                setError(undefined);
                try {
                  if (state === "on") {
                    await turnPushOff();
                    setState("off");
                  } else {
                    const result = await turnPushOn();
                    setState(result.state);
                    setError(result.error);
                  }
                } catch {
                  setError("Das hat nicht geklappt. Bitte versuchen Sie es noch einmal.");
                }
              })
            }
          />
        </span>
      )}
      {error && <FormMessage error={error} />}
    </div>
  );
}
