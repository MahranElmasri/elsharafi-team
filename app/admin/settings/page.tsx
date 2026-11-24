import type { Metadata } from "next";
import { AppHeader } from "@/components/AppHeader";
import { Stamp } from "@/components/Stamp";
import { labels } from "@/lib/labels";
import { loadSettings } from "@/lib/settings";
import { requireUser } from "@/lib/session";
import { createServerClient } from "@/lib/supabase/server";
import { Recipients } from "./Recipients";
import { SwitchList } from "./SwitchList";
import { TypeForm, type TypeRow } from "./TypeForm";
import { TypeVisibleSwitch } from "./TypeVisibleSwitch";

export const metadata: Metadata = { title: `Einstellungen – ${labels.practice}` };

const MODE = { request: "beantragen", report: "melden", admin: "Praxisleitung" } as const;

export default async function SettingsPage() {
  const user = await requireUser("admin");
  const supabase = await createServerClient();
  const [settings, types, recipients] = await Promise.all([
    loadSettings(supabase),
    supabase
      .from("absence_types")
      .select(
        "code, letter, label, color, entry_mode, deducts_vacation, is_health, limit_days, limit_years, visible, is_fixed, sort",
      )
      .order("sort")
      .order("label"),
    supabase.from("notify_recipients").select("email").order("email"),
  ]);
  if (types.error) throw new Error(types.error.message);
  if (recipients.error) throw new Error(recipients.error.message);
  const rows = (types.data ?? []) as TypeRow[];

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto grid max-w-3xl gap-10 px-4 py-8">
        <header className="grid gap-1">
          <h1 className="text-3xl font-extrabold tracking-tight">Einstellungen</h1>
          <p className="text-ink-2">Gilt für die ganze Praxis.</p>
        </header>

        <section aria-label="Funktionen" className="grid gap-4 border-t-2 border-ink pt-6">
          <h2 className="text-xl font-bold">Funktionen</h2>
          <SwitchList settings={settings} />
        </section>

        <section aria-label="E-Mail-Empfänger" className="grid gap-4 border-t-2 border-ink pt-6">
          <h2 className="text-xl font-bold">E-Mail-Empfänger</h2>
          <p className="text-sm text-ink-2">
            Zum Beispiel der Empfang: Diese Adressen erfahren per E-Mail, wer nicht in der Praxis
            ist. Bei einer Krankmeldung sofort, bei Urlaub und anderen Anträgen erst, wenn die
            Praxisleitung sie genehmigt hat, und noch einmal, wenn eine genehmigte Abwesenheit
            storniert wird. Ebenso, wenn die Praxisleitung in der Übersicht eine Abwesenheit
            einträgt oder entfernt. Die E-Mail nennt nur Name und Datum, nie den Grund, und enthält
            keinen Link zur App.
          </p>
          <Recipients emails={(recipients.data ?? []).map((r) => r.email as string)} />
        </section>

        <section aria-label="Abwesenheitsarten" className="grid gap-4 border-t-2 border-ink pt-6">
          <h2 className="text-xl font-bold">Abwesenheitsarten</h2>
          <p className="text-sm text-ink-2">
            Ausgeblendete Arten verschwinden aus Formularen und Menüs. Bestehende Einträge bleiben
            sichtbar und zählen weiter.
          </p>
          <ul className="grid gap-2">
            {rows.map((t) => (
              <li
                key={t.code}
                className="flex items-start gap-2 rounded-xl border border-rule bg-sheet"
              >
                <details className="min-w-0 flex-1">
                  <summary
                    className={`flex cursor-pointer flex-wrap items-center gap-3 p-3 ${t.visible ? "" : "text-pencil"}`}
                  >
                    <Stamp letter={t.letter} color={t.color} />
                    <b>{t.label}</b>
                    <span className="text-sm text-ink-2">
                      {MODE[t.entry_mode]}
                      {t.deducts_vacation && ", zieht Urlaub ab"}
                      {t.is_health && ", Gesundheitsdaten"}
                      {t.limit_days !== null &&
                        `, höchstens ${Number(t.limit_days).toLocaleString("de-DE")} Tage in ${t.limit_years === 1 ? "1 Jahr" : "2 Jahren"}`}
                      {!t.visible && ", ausgeblendet"}
                    </span>
                  </summary>
                  <div className="border-t border-rule p-3">
                    <TypeForm type={t} />
                  </div>
                </details>
                {!t.is_fixed && (
                  <div className="p-3">
                    <TypeVisibleSwitch code={t.code} label={t.label} visible={t.visible} />
                  </div>
                )}
              </li>
            ))}
          </ul>
          <details className="rounded-xl border-2 border-dashed border-rule p-3">
            <summary className="cursor-pointer font-bold">Neue Art</summary>
            <div className="pt-3">
              <TypeForm />
            </div>
          </details>
        </section>
      </main>
    </>
  );
}
