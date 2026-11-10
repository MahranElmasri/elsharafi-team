import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { saveEmployee } from "@/app/actions/employees";
import { AppHeader } from "@/components/AppHeader";
import { FormMessage } from "@/components/FormMessage";
import { WorkdayCircles } from "@/components/WorkdayCircles";
import { labels } from "@/lib/labels";
import { requireUser } from "@/lib/session";
import { createServerClient } from "@/lib/supabase/server";
import { EmployeeForm } from "../EmployeeForm";
import { AccountPanel } from "./AccountPanel";
import { AllowanceForm } from "./AllowanceForm";
import { InvitePanel } from "./InvitePanel";

const L = labels.employees;

export const metadata: Metadata = { title: `${L.title} – ${labels.practice}` };

export default async function EmployeePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ neu?: string; jahr?: string }>;
}) {
  const me = await requireUser("admin");
  const [{ id }, { neu, jahr }] = await Promise.all([params, searchParams]);
  const thisYear = Number(
    new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" }).slice(0, 4),
  );
  const year = /^\d{4}$/.test(jahr ?? "") ? Number(jahr) : thisYear;

  const supabase = await createServerClient();
  const [{ data: person }, { data: teams }, { data: allowance }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, full_name, username, notify_email, team_id, role, active, workdays, start_date, end_date",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("teams").select("id, name").order("sort"),
    supabase
      .from("leave_allowances")
      .select("days, carryover")
      .eq("user_id", id)
      .eq("year", year)
      .maybeSingle(),
  ]);
  if (!person) notFound();
  const isMe = person.id === me.id;

  return (
    <>
      <AppHeader user={me} />
      <main className="mx-auto grid max-w-3xl gap-10 px-4 py-8">
        <header className="grid gap-2">
          <Link href="/admin/employees" className="btn-plain justify-self-start text-sm">
            {L.back}
          </Link>
          <h1 className="text-3xl font-extrabold tracking-tight">{person.full_name}</h1>
          <p className="flex flex-wrap items-center gap-3 text-pencil">
            <WorkdayCircles workdays={person.workdays} />
            <span>
              {person.username}
              {!person.active && ` · ${L.inactive}`}
            </span>
          </p>
          {neu && <FormMessage ok={L.created} />}
        </header>

        <Section title={L.login}>
          <InvitePanel id={person.id} active={person.active} />
        </Section>

        <Section title={L.details}>
          <EmployeeForm
            action={saveEmployee.bind(null, person.id)}
            teams={teams ?? []}
            submitLabel={L.save}
            pendingLabel={L.saving}
            initial={{
              fullName: person.full_name,
              username: person.username,
              email: person.notify_email ?? "",
              team: person.team_id,
              role: person.role as "admin" | "employee",
              workdays: person.workdays,
              startDate: person.start_date,
              endDate: person.end_date ?? "",
            }}
          />
        </Section>

        <Section title={`${L.allowance} ${year}`}>
          <nav className="flex gap-4 text-sm" aria-label="Jahr">
            <Link href={`?jahr=${year - 1}`} className="btn-plain">
              {year - 1}
            </Link>
            <Link href={`?jahr=${year + 1}`} className="btn-plain">
              {year + 1}
            </Link>
          </nav>
          <AllowanceForm
            key={year}
            id={person.id}
            year={year}
            days={allowance ? Number(allowance.days) : null}
            carryover={allowance ? Number(allowance.carryover) : 0}
          />
        </Section>

        <Section title={L.account}>
          {isMe ? (
            <p className="text-pencil">{L.selfHint}</p>
          ) : (
            <AccountPanel id={person.id} name={person.full_name} active={person.active} />
          )}
        </Section>
      </main>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-t-2 border-ink pt-6">
      <h2 className="text-xl font-bold">{title}</h2>
      {children}
    </section>
  );
}
