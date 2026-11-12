"use client";

import { useOptimistic, useState, useTransition } from "react";
import { setTypeVisible, type FormState } from "@/app/actions/settings";
import { FormMessage } from "@/components/FormMessage";
import { Switch } from "@/components/Switch";

/** "Sichtbar" switch on a type's row; saves on click (R25). Errors show below the row. */
export function TypeVisibleSwitch({
  code,
  label,
  visible,
}: {
  code: string;
  label: string;
  visible: boolean;
}) {
  const [on, setOn] = useOptimistic(visible);
  const [message, setMessage] = useState<FormState>({});
  const [busy, start] = useTransition();
  return (
    <div className="grid justify-items-end gap-1">
      <span className="flex items-center gap-2 text-sm text-ink-2">
        Sichtbar
        <Switch
          on={on}
          label={`${label} sichtbar`}
          disabled={busy}
          onToggle={() =>
            start(async () => {
              setOn(!on);
              setMessage(await setTypeVisible(code, !on));
            })
          }
        />
      </span>
      {message.error && <FormMessage error={message.error} />}
    </div>
  );
}
