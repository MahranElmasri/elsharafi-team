import type { Metadata } from "next";
import Link from "next/link";
import { createEmployee } from "@/app/actions/employees";
import { AppHeader } from "@/components/AppHeader";
import { FormMessage } from "@/components/FormMessage";
import { WorkdayCircles } from "@/components/WorkdayCircles";
import { labels } from "@/lib/labels";
import { lastSignIns } from "@/lib/people";
import { requireUser } from "@/lib/session";
import { createServerClient } from "@/lib/supabase/server";
import { EmployeeForm } from "./EmployeeForm";
import { TeamLimitsForm } from "./TeamLimitsForm";

const L = labels.employees;

export const metadata: Metadata = { title: `${L.title} – ${labels.practice}` };

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ geloescht?: string }>;
}) {
  const me = await requireUser("admin");
  const supabase = await createServerClient();
  const [{ data: teams }, { data: people }, signIns, { geloescht }] = await Promise.all([
    supabase.from("teams").select("id, name, max_absent, sort").order("sort"),
    supabase
      .from("profiles")
      .select("id, full_name, username, team_id, role, active, workdays")
      .order("full_name"),
    lastSignIns(),
    searchParams,
  ]);

  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });

  return (
    <>
      <AppHeader user={me} />
      <main className="mx-auto grid max-w-5xl gap-10 px-4 py-8">
        <h1 className="text-3xl font-extrabold tracking-tight">{L.title}</h1>
        {geloescht && <FormMessage ok={L.deletedNotice} />}

        {(teams ?? []).map((team) => {
          const members = (people ?? []).filter((p) => p.team_id === team.id);
          return (
            <section key={team.id} className="grid gap-2">
              <h2 className="text-xl font-bold">
                {team.name} <span className="font-normal text-pencil">{members.length}</span>
              </h2>
              <ul className="border-t-2 border-ink">
                {members.map((p) => (
                  <li
                    key={p.id}
                    className={`grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 border-b border-rule py-2.5 ${
                      p.active ? "" : "text-pencil"
                    }`}
                  >
                    <span className="grid">
                      <Link
                        href={`/admin/employees/${p.id}`}
                        className="font-bold underline-offset-3 hover:underline"
                      >
                        {p.full_name}
                        {p.id === me.id && (
                          <span className="font-normal text-pencil"> ({L.you})</span>
                        )}
                      </Link>
                      <span className="text-sm text-pencil">
                        {p.username}
                        {p.role === "admin" && ` · ${labels.roles.admin}`}
                        {!p.active && ` · ${L.inactive}`}
                        {p.active && !signIns.get(p.id) && ` · ${L.neverLoggedIn}`}
                      </span>
                    </span>
                    <WorkdayCircles workdays={p.workdays} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        <section className="grid gap-4 border-t-2 border-ink pt-6">
          <h2 className="text-xl font-bold">{L.add}</h2>
          <EmployeeForm
            action={createEmployee}
            teams={teams ?? []}
            submitLabel={L.add}
            pendingLabel={L.adding}
            initial={{
              fullName: "",
              username: "",
              email: "",
              team: "arbeiter",
              role: "employee",
              workdays: [1, 2, 3, 4, 5],
              startDate: today,
              endDate: "",
            }}
          />
        </section>

        <section className="grid gap-4 border-t-2 border-ink pt-6">
          <h2 className="text-xl font-bold">{L.teamLimits}</h2>
          <TeamLimitsForm teams={teams ?? []} />
        </section>
      </main>
    </>
  );
}
