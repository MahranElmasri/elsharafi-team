import type { SupabaseClient } from "@supabase/supabase-js";

/** The practice-wide feature switches (R24). The database enforces them as well. */
export interface Settings {
  teamCalendar: boolean;
  halfDays: boolean;
  substitutes: boolean;
  auTracking: boolean;
  reminders: boolean;
}

export const SWITCHES: { key: keyof Settings; column: string; label: string; hint: string }[] = [
  {
    key: "teamCalendar",
    column: "team_calendar",
    label: "Teamkalender",
    hint: "Mitarbeitende sehen, wann Kolleg/innen ihrer Gruppe abwesend sind (ohne Grund).",
  },
  {
    key: "halfDays",
    column: "half_days",
    label: "Halbe Tage",
    hint: "Abwesenheiten können vormittags oder nachmittags eingetragen werden.",
  },
  {
    key: "substitutes",
    column: "substitutes",
    label: "Vertretung",
    hint: "Beim Antrag kann eine Vertretung aus derselben Gruppe gewählt werden.",
  },
  {
    key: "auTracking",
    column: "au_tracking",
    label: "AU-Nachverfolgung",
    hint: "„AU liegt vor“ abhaken; fehlende AUs nach mehr als 3 Krankheitstagen werden gemeldet.",
  },
  {
    key: "reminders",
    column: "reminders",
    label: "Urlaubserinnerungen",
    hint: "Ab 1.10. monatlich an Resturlaub erinnern, ab 1.2. an verfallenden Übertrag (E-Mail und App). Ohne diesen Hinweis verfällt Urlaub nach BAG-Rechtsprechung nicht.",
  },
];

/** The inks a type can be stamped in (CSS variables in globals.css). */
export const TYPE_COLORS: { value: string; label: string }[] = [
  { value: "--urlaub", label: "Blau" },
  { value: "--krank", label: "Rot" },
  { value: "--green", label: "Grün" },
  { value: "--violet", label: "Violett" },
  { value: "--brown", label: "Braun" },
  { value: "--slate", label: "Schiefer" },
];

export async function loadSettings(supabase: SupabaseClient): Promise<Settings> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("team_calendar, half_days, substitutes, au_tracking, reminders")
    .single();
  if (error) throw new Error(error.message);
  return {
    teamCalendar: data.team_calendar,
    halfDays: data.half_days,
    substitutes: data.substitutes,
    auTracking: data.au_tracking,
    reminders: data.reminders,
  };
}

/** A new type's code from its label: "Kur (Reha)" → "kur_reha". Codes never change later. */
export function codeFromLabel(label: string, taken: string[]): string {
  const base =
    label
      .toLowerCase()
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss")
      .replace(/[^a-z]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 28) || "art";
  const padded = base.length < 2 ? `${base}_art` : base;
  // Codes allow only a–z and "_", so clashes get a letter: kur, kur_b, kur_c …
  for (const suffix of ["", ..."bcdefghijklmnopqrstuvwxyz"]) {
    const code = suffix ? `${padded}_${suffix}` : padded;
    if (!taken.includes(code)) return code;
  }
  throw new Error("Zu viele Arten mit ähnlicher Bezeichnung.");
}
