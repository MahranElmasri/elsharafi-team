"use client";

import { useId, useState } from "react";
import { labels } from "@/lib/labels";

type Props = {
  label: string;
  name: string;
  autoComplete: "current-password" | "new-password";
  minLength?: number;
};

/** Password field with an eye button that shows or hides the typed text (R23). */
export function PasswordInput({ label, name, autoComplete, minLength }: Props) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const t = labels.showPassword;

  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-bold">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          autoCapitalize="none"
          spellCheck={false}
          minLength={minLength}
          required
          className="field w-full pr-11"
        />
        <button
          type="button"
          aria-label={t.name}
          aria-pressed={visible}
          aria-controls={id}
          title={visible ? t.hide : t.show}
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 grid w-11 place-items-center opacity-70 hover:opacity-100 focus-visible:opacity-100"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
            {visible && <path d="M3 3l18 18" />}
          </svg>
        </button>
      </div>
    </div>
  );
}
