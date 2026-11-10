import { expect, test, type Page } from "@playwright/test";
import { admin, createAccount, deleteAccount, type TestAccount } from "./accounts";

const tag = Date.now().toString(36);
let boss: TestAccount;
let ana: TestAccount; // Arbeiter, part-time Mon/Tue/Thu
let dora: TestAccount; // Ärzte

async function setUp(account: TestAccount, name: string, team: string, workdays: number[]) {
  await admin
    .from("profiles")
    .update({ full_name: name, team_id: team, workdays, start_date: "2020-01-01" })
    .eq("id", account.id);
}

const day = (user: string, d: string, type: string, extra: Record<string, unknown> = {}) => ({
  user_id: user,
  day: d,
  type,
  amount: 1,
  half: null,
  status: "approved",
  ...extra,
});

test.beforeAll(async () => {
  boss = await createAccount("leitung", "admin");
  ana = await createAccount("ana", "employee");
  dora = await createAccount("dora", "employee");
  await setUp(ana, `Ana ${tag}`, "arbeiter", [1, 2, 4]);
  await setUp(dora, `Dora ${tag}`, "aerzte", [1, 2, 3, 4, 5]);
  await admin
    .from("leave_allowances")
    .insert({ user_id: ana.id, year: 2026, days: 20, carryover: 0 });
  const { error } = await admin.from("absence_days").insert([
    // Dora: sick Thu 5.11. – Mon 9.11. without AU (a run over 3 calendar days)
    day(dora.id, "2026-11-05", "sick"),
    day(dora.id, "2026-11-06", "sick"),
    day(dora.id, "2026-11-09", "sick"),
    // Ana: approved vacation, a pending request, a half day
    day(ana.id, "2026-11-16", "vacation"),
    day(ana.id, "2026-11-17", "vacation"),
    day(ana.id, "2026-11-23", "vacation", { status: "pending" }),
    day(ana.id, "2026-11-12", "vacation", { amount: 0.5, half: "pm" }),
  ]);
  if (error) throw error;
  await admin.from("day_notes").insert({ user_id: ana.id, day: "2026-11-10", note: "Arzttermin" });
});

test.afterAll(async () => {
  for (const a of [ana, dora]) await admin.from("absence_days").delete().eq("user_id", a.id);
  for (const a of [boss, ana, dora]) await deleteAccount(a);
});

async function openGrid(page: Page, month: string) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Benutzername").fill(boss.username);
  await page.getByLabel("Passwort").fill(boss.password);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto(`/admin?monat=${month}`);
  await page.getByPlaceholder("Name suchen").fill(tag);
}

const cell = (page: Page, text: string) =>
  page.locator("td button.cell").and(page.getByRole("button", { name: text }));

test("the month sheet shows entries, pencil and ink, notes and missing AU", async ({ page }) => {
  await openGrid(page, "2026-11");
  await expect(page.getByRole("heading", { name: "November 2026" })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(2);

  await expect(cell(page, `Ana ${tag}, Montag 16.: Urlaub`)).toHaveCount(1);
  await expect(cell(page, `Ana ${tag}, Montag 23.: Urlaub, beantragt`)).toHaveCount(1);
  await expect(cell(page, `Ana ${tag}, Donnerstag 12.: Urlaub, nachmittags`)).toHaveCount(1);
  await expect(cell(page, `Ana ${tag}, Mittwoch 11.: kein Arbeitstag`)).toHaveCount(1);
  await expect(cell(page, `Ana ${tag}, Freitag 13.: kein Arbeitstag`)).toHaveCount(1);

  const anaRow = page.locator("tbody tr", { hasText: `Ana ${tag}` });
  await expect(anaRow.locator(".stamp.pending")).toHaveCount(1);
  await expect(anaRow.locator(".note-dot")).toHaveAttribute("title", "Arzttermin");
  await expect(anaRow.getByLabel("2,5 Urlaubstage genommen")).toBeVisible();
  await expect(anaRow.getByLabel("17,5 Tage Resturlaub")).toBeVisible();

  const doraRow = page.locator("tbody tr", { hasText: `Dora ${tag}` });
  await expect(doraRow.locator(".au-miss")).toHaveCount(3);
  await expect(doraRow.getByLabel("3 Krankheitstage")).toBeVisible();
  await expect(doraRow.getByTitle(/Kein Urlaubsanspruch/)).toBeVisible();
});

test("tabs and search filter the rows; holidays and month navigation work", async ({ page }) => {
  await openGrid(page, "2026-11");
  await page.getByRole("tab", { name: /Ärzte/ }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody tr")).toContainText(`Dora ${tag}`);

  await page.getByRole("tab", { name: /Alle/ }).click();
  await page.getByPlaceholder("Name suchen").fill(`niemand-${tag}`);
  await expect(page.getByText(/Niemand passt zur Suche/)).toBeVisible();

  await page.getByRole("link", { name: "Nächster Monat" }).click();
  await expect(page.getByRole("heading", { name: "Dezember 2026" })).toBeVisible();
  await expect(page.locator("thead th.hol")).toHaveAttribute("title", "1. Weihnachtstag");
  await expect(page.locator("thead th.month-start")).toContainText("1");
  await expect(page.locator("thead th")).toHaveCount(24); // name column + 23 weekdays
});

async function dbEntry(user: string, d: string) {
  const { data } = await admin
    .from("absence_days")
    .select("type, half, au_received")
    .eq("user_id", user)
    .eq("day", d)
    .maybeSingle();
  return data;
}

const toast = (page: Page) => page.getByRole("status").filter({ hasText: /./ }).last();

test("a click cycles X → U → frei and saves each step", async ({ page }) => {
  await openGrid(page, "2026-11");
  const target = cell(page, `Ana ${tag}, Donnerstag 19.:`);
  await target.click();
  await expect(target).toHaveAccessibleName(/: Krank$/);
  await expect.poll(() => dbEntry(ana.id, "2026-11-19").then((e) => e?.type)).toBe("sick");

  await target.click();
  await expect(target).toHaveAccessibleName(/: Urlaub$/);
  await expect.poll(() => dbEntry(ana.id, "2026-11-19").then((e) => e?.type)).toBe("vacation");

  await target.click();
  await expect(target).toHaveAccessibleName(/: frei$/);
  await expect.poll(() => dbEntry(ana.id, "2026-11-19")).toBeNull();
});

test("days that can't be entered explain why", async ({ page }) => {
  await openGrid(page, "2026-11");
  // Non-working days are aria-disabled; they still explain themselves on Enter.
  await cell(page, `Ana ${tag}, Mittwoch 18.:`).focus();
  await page.keyboard.press("Enter");
  await expect(toast(page)).toHaveText(`Ana ${tag} arbeitet an diesem Tag nicht.`);
  await cell(page, `Ana ${tag}, Montag 23.:`).click();
  await expect(toast(page)).toContainText("offener Antrag");
});

test("the menu sets other types, half days and notes, and removes entries", async ({ page }) => {
  await openGrid(page, "2026-11");
  const target = cell(page, `Ana ${tag}, Dienstag 24.:`);

  await target.click({ button: "right" });
  await page.getByRole("menuitemradio", { name: "Fortbildung" }).click();
  await expect(target).toHaveAccessibleName(/: Fortbildung$/);
  await expect.poll(() => dbEntry(ana.id, "2026-11-24").then((e) => e?.type)).toBe("training");

  await target.click({ button: "right" });
  await page.getByRole("menuitemradio", { name: "Halber Tag, vormittags" }).click();
  await expect(target).toHaveAccessibleName(/: Fortbildung, vormittags$/);
  await expect.poll(() => dbEntry(ana.id, "2026-11-24").then((e) => e?.half)).toBe("am");

  await target.click({ button: "right" });
  await page.getByLabel("Notiz zu diesem Tag").fill("Kurs in Potsdam");
  await page.getByRole("button", { name: "Notiz speichern" }).click();
  await expect(target).toHaveAccessibleName(/Notiz: Kurs in Potsdam/);

  // A plain click on another type opens the menu instead of overwriting it.
  await target.click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.getByRole("menuitem", { name: "Eintrag entfernen" }).click();
  await expect(target).toHaveAccessibleName(/: frei, Notiz: Kurs in Potsdam$/);
  await expect.poll(() => dbEntry(ana.id, "2026-11-24")).toBeNull();
  await admin.from("day_notes").delete().eq("user_id", ana.id).eq("day", "2026-11-24");
});

test("AU liegt vor covers the whole sick run", async ({ page }) => {
  await openGrid(page, "2026-11");
  const doraRow = page.locator("tbody tr", { hasText: `Dora ${tag}` });
  await expect(doraRow.locator(".au-miss")).toHaveCount(3);

  await cell(page, `Dora ${tag}, Freitag 6.:`).click({ button: "right" });
  await page.getByRole("menuitemcheckbox", { name: "AU liegt vor" }).click();
  await expect(toast(page)).toHaveText("AU liegt vor, für 3 Krankheitstage.");
  await expect(doraRow.locator(".au-miss")).toHaveCount(0);
  await expect.poll(() => dbEntry(dora.id, "2026-11-09").then((e) => e?.au_received)).toBe(true);
});

test("a count opens the dates behind it", async ({ page }) => {
  await openGrid(page, "2026-11");
  await page.getByRole("button", { name: "3 Krankheitstage, Daten anzeigen" }).click();
  await expect(page.getByRole("dialog")).toContainText("5.–9.11.");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("the grid works from the keyboard", async ({ page }) => {
  await openGrid(page, "2026-11");
  const start = cell(page, `Ana ${tag}, Montag 2.:`);
  await start.focus();
  await page.keyboard.press("ArrowRight"); // Tuesday 3.
  await expect(cell(page, `Ana ${tag}, Dienstag 3.:`)).toBeFocused();
  await page.keyboard.press("Space");
  await expect(cell(page, `Ana ${tag}, Dienstag 3.:`)).toHaveAccessibleName(/: Krank$/);
  await page.keyboard.press("Shift+F10");
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(page.getByRole("menuitemradio", { name: "Krank", exact: true })).toBeFocused();
  await page.getByRole("menuitem", { name: "Eintrag entfernen" }).click();
  await expect(cell(page, `Ana ${tag}, Dienstag 3.:`)).toHaveAccessibleName(/: frei$/);
  await expect.poll(() => dbEntry(ana.id, "2026-11-03")).toBeNull();
});
