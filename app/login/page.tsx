import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { labels } from "@/lib/labels";
import { createServerClient } from "@/lib/supabase/server";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: `${labels.login.title} – ${labels.practice}` };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ gesperrt?: string }>;
}) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/");

  const { gesperrt } = await searchParams;

  return (
    <main className="mx-auto grid min-h-dvh max-w-sm content-center gap-8 px-4 py-12">
      <header className="grid gap-1">
        <p className="text-pencil">{labels.practice}</p>
        <h1 className="text-4xl font-extrabold tracking-tight">{labels.appName}</h1>
      </header>
      <section className="grid gap-6 border-t-2 border-ink pt-6">
        <h2 className="text-xl font-bold">{labels.login.title}</h2>
        <LoginForm notice={gesperrt ? labels.login.blocked : undefined} />
        <Link href="/passwort-vergessen" className="btn-plain justify-self-start">
          {labels.forgotLink}
        </Link>
      </section>
    </main>
  );
}
