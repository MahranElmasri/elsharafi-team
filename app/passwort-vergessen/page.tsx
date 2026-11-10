import type { Metadata } from "next";
import Link from "next/link";
import { labels } from "@/lib/labels";
import { ForgotForm } from "./ForgotForm";

export const metadata: Metadata = { title: `${labels.forgot.title} – ${labels.practice}` };

export default function ForgotPage() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-sm content-center gap-8 px-4 py-12">
      <header className="grid gap-1">
        <p className="text-pencil">{labels.practice}</p>
        <h1 className="text-4xl font-extrabold tracking-tight">{labels.appName}</h1>
      </header>
      <section className="grid gap-6 border-t-2 border-ink pt-6">
        <h2 className="text-xl font-bold">{labels.forgot.title}</h2>
        <ForgotForm />
        <Link href="/login" className="btn-plain">
          {labels.invite.toLogin}
        </Link>
      </section>
    </main>
  );
}
