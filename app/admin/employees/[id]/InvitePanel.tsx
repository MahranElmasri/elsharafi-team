"use client";

import { useState, useTransition } from "react";
import { createInviteFor, type InviteResult } from "@/app/actions/employees";
import { FormMessage } from "@/components/FormMessage";
import { labels } from "@/lib/labels";

const L = labels.employees;

export function InvitePanel({ id, active }: { id: string; active: boolean }) {
  const [result, setResult] = useState<InviteResult>({});
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const until = result.expiresAt
    ? new Date(result.expiresAt).toLocaleString("de-DE", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Europe/Berlin",
      })
    : "";

  return (
    <div className="grid gap-4">
      <p className="text-sm text-pencil">{L.loginHint}</p>
      <button
        type="button"
        disabled={pending || !active}
        className="btn-ink justify-self-start"
        onClick={() =>
          start(async () => {
            setCopied(false);
            setResult(await createInviteFor(id));
          })
        }
      >
        {pending ? L.inviting : L.invite}
      </button>
      <FormMessage error={result.error} />

      {result.url && (
        <div className="invite-sheet grid gap-4 border-2 border-ink p-4 sm:grid-cols-[auto_1fr]">
          <div
            className="size-[220px] bg-white"
            role="img"
            aria-label="QR-Code mit dem Einladungslink"
            dangerouslySetInnerHTML={{ __html: result.qrSvg ?? "" }}
          />
          <div className="grid content-start gap-3">
            <p>{result.emailedTo ? L.inviteEmailed(result.emailedTo) : L.inviteNoEmail}</p>
            <input
              readOnly
              value={result.url}
              aria-label="Einladungslink"
              onFocus={(e) => e.currentTarget.select()}
              className="field text-sm"
            />
            <p className="text-sm text-pencil">{L.inviteValid(until)}</p>
            <div className="flex gap-4 print:hidden">
              <button
                type="button"
                className="btn-plain"
                onClick={async () => {
                  await navigator.clipboard.writeText(result.url!);
                  setCopied(true);
                }}
              >
                {copied ? L.copied : L.copy}
              </button>
              <button type="button" className="btn-plain" onClick={() => window.print()}>
                {L.print}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
