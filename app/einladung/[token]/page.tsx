import type { Metadata } from "next";
import Link from "next/link";
import { hashToken } from "@/lib/invites";
import { labels } from "@/lib/labels";
import { createAdminClient } from "@/lib/supabase/admin";
import { SetPasswordForm } from "./SetPasswordForm";

// The token is in the URL: never send it on as a referrer.
export const metadata: Metadata = {
  title: `${labels.invite.titleInvite} – ${labels.practice}`,
  referrer: "no-referrer",
};

type Peek = {
  status: "ok" | "unknown" | "used" | "expired" | "inactive";
  full_name: string | null;
  purpose: string | null;
};

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data } = await createAdminClient().rpc("peek_invite", { p_hash: hashToken(token) });
  const peek = (data as Peek[] | null)?.[0] ?? {
    status: "unknown",
    full_name: null,
    purpose: null,
  };
  const title = peek.purpose === "reset" ? labels.invite.titleReset : labels.invite.titleInvite;

  return (
    <main className="mx-auto grid min-h-dvh max-w-sm content-center gap-8 px-4 py-12">
      <header className="grid gap-1">
        <p className="text-pencil">{labels.practice}</p>
        <h1 className="text-4xl font-extrabold tracking-tight">{labels.appName}</h1>
      </header>
      <section className="grid gap-6 border-t-2 border-ink pt-6">
        <h2 className="text-xl font-bold">{title}</h2>
        {peek.status === "ok" ? (
          <>
            <p className="text-ink-2">{labels.invite.greeting(peek.full_name ?? "")}</p>
            <SetPasswordForm token={token} />
          </>
        ) : (
          <>
            <p role="alert" className="border-l-4 border-krank pl-3 text-krank">
              {labels.invite[peek.status]}
            </p>
            <Link href="/login" className="btn-plain">
              {labels.invite.toLogin}
            </Link>
          </>
        )}
      </section>
    </main>
  );
}
