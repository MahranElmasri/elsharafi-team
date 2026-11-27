import { expect, test, type Page } from "@playwright/test";
import { admin, createAccount, deleteAccount, type TestAccount } from "./accounts";
import { openDialog } from "./dialogs";

// Practice-wide switches: playwright.config.ts runs this file after all others, never alongside.
test.describe.configure({ mode: "serial" });

const tag = Date.now().toString(36);
const typeLabel = `Testart ${tag}`;
// Letters are unique across types; two random capitals (no seeded type uses Q or Y first).
const letter = `${"QY"[Math.floor(Math.random() * 2)]}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}`;
let boss: TestAccount;
let ida: TestAccount;

test.beforeAll(async () => {
  boss = await createAccount("einst", "admin");
  ida = await createAccount("ida", "employee");
  await admin
    .from("profiles")
    .update({ full_name: `Boss ${tag}` })
    .eq("id", boss.id);
  await admin
    .from("profiles")
    .update({ full_name: `Ida ${tag}`, workdays: [1, 2, 3, 4, 5], start_date: "2020-01-01" })
    .eq("id", ida.id);
  await admin
    .from("leave_allowances")
    .insert({ user_id: ida.id, year: 2026, days: 30, carryover: 0 });
  // The half-day choices appear only on a cell that has an entry.
  const { error } = await admin
    .from("absence_days")
    .insert({ user_id: ida.id, day: "2026-11-26", type: "sick", amount: 1, status: "approved" });
  if (error) throw error;
});

test.afterAll(async () => {
  await admin
    .from("app_settings")
    .update({
      half_days: true,
      team_calendar: true,
      substitutes: true,
      au_tracking: true,
      reminders: true,
    })
    .eq("id", true);
  await admin.from("absence_days").delete().eq("user_id", ida.id);
  await admin.from("absence_types").delete().eq("label", typeLabel);
  await admin.from("absence_types").update({ visible: true }).eq("code", "special_move");
  await admin.from("notify_recipients").delete().like("email", `%${tag}%`);
  for (const a of [boss, ida]) await deleteAccount(a);
});

async function logIn(page: Page, account: TestAccount, home: RegExp) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Benutzername").fill(account.username);
  await page.getByLabel("Passwort").fill(account.password);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL(home, { timeout: 30_000 });
}

async function openSettings(page: Page) {
  await page.goto("/admin/settings");
  await page.waitForLoadState("networkidle");
}

async function flip(page: Page, name: string, on: boolean) {
  const sw = page.getByRole("switch", { name });
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", String(on));
  await expect(page.getByRole("status").filter({ hasText: name })).toContainText(
    on ? "eingeschaltet" : "ausgeschaltet",
  );
}

const cell = (page: Page, text: string) =>
  page.locator("td button.cell").and(page.getByRole("button", { name: text }));

test("switching off half days removes the ½ option everywhere", async ({ page, browser }) => {
  test.slow();
  await logIn(page, boss, /\/admin$/);
  await openSettings(page);
  await flip(page, "Halbe Tage", false);

  await page.goto("/admin?monat=2026-11");
  await cell(page, `Ida ${tag}, Donnerstag 26.:`).click({ button: "right" });
  await expect(page.getByRole("menuitemradio", { name: "Krank", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitemradio", { name: /Halber Tag/ })).toHaveCount(0);
  await page.keyboard.press("Escape");

  const idaPage = await browser.newPage();
  await logIn(idaPage, ida, /\/me$/);
  await idaPage.waitForLoadState("networkidle");
  await openDialog(idaPage, "Urlaub beantragen", "Abwesenheit beantragen");
  await expect(idaPage.getByText("Am ersten Tag erst ab mittags frei")).toHaveCount(0);
  await idaPage.close();

  await openSettings(page);
  await flip(page, "Halbe Tage", true);
  await page.goto("/admin?monat=2026-11");
  await cell(page, `Ida ${tag}, Donnerstag 26.:`).click({ button: "right" });
  await expect(page.getByRole("menuitemradio", { name: "Halber Tag, vormittags" })).toBeVisible();
});

test("switching off the team calendar removes the Team tab", async ({ page, browser }) => {
  test.slow();
  await logIn(page, boss, /\/admin$/);
  await openSettings(page);
  await flip(page, "Teamkalender", false);

  const idaPage = await browser.newPage();
  await logIn(idaPage, ida, /\/me$/);
  await expect(idaPage.getByRole("link", { name: "Team" })).toHaveCount(0);

  await flip(page, "Teamkalender", true);
  await idaPage.reload();
  await expect(idaPage.getByRole("link", { name: "Team" })).toBeVisible();
  await idaPage.close();
});

test("a hidden type leaves the menu while old cells still show it", async ({ page }) => {
  test.slow();
  await logIn(page, boss, /\/admin$/);
  await openSettings(page);

  const types = page.getByRole("region", { name: "Abwesenheitsarten" });
  await types.getByText("Neue Art").click();
  const add = types.locator("details").filter({ hasText: "Neue Art" });
  await add.getByLabel("Bezeichnung").fill(typeLabel);
  await add.getByLabel("Zeichen").fill(letter);
  await add.getByLabel("Eingetragen von").selectOption("admin");
  await add.getByRole("button", { name: "Art hinzufügen" }).click();
  await expect(add.getByRole("status")).toContainText(`„${typeLabel}“ gespeichert.`);

  await page.goto("/admin?monat=2026-11");
  await cell(page, `Ida ${tag}, Freitag 27.:`).click({ button: "right" });
  await page.getByRole("menuitemradio", { name: typeLabel }).click();
  await expect(cell(page, `Ida ${tag}, Freitag 27.: ${typeLabel}`)).toBeVisible();

  await openSettings(page);
  const row = types.getByRole("listitem").filter({ hasText: typeLabel });
  await row.getByRole("switch", { name: `${typeLabel} sichtbar` }).click();
  await expect(row.locator("summary")).toContainText("ausgeblendet");

  await page.goto("/admin?monat=2026-11");
  await expect(cell(page, `Ida ${tag}, Freitag 27.: ${typeLabel}`)).toBeVisible();
  await cell(page, `Ida ${tag}, Donnerstag 26.:`).click({ button: "right" });
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(page.getByRole("menuitemradio", { name: typeLabel })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // In use: it can only be hidden, not deleted.
  await openSettings(page);
  await row.locator("summary").click();
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "Löschen" }).click();
  await expect(row.getByRole("alert")).toContainText("kann nur ausgeblendet werden");
});

test("each Sonderurlaub type can be hidden and shown with one click", async ({ page, browser }) => {
  test.slow();
  await logIn(page, boss, /\/admin$/);
  await openSettings(page);
  const types = page.getByRole("region", { name: "Abwesenheitsarten" });
  const umzug = types.getByRole("switch", { name: "Sonderurlaub Umzug sichtbar" });
  // Fixed types stay visible, so they have no switch.
  await expect(types.getByRole("switch", { name: "Urlaub sichtbar", exact: true })).toHaveCount(0);

  await expect(umzug).toHaveAttribute("aria-checked", "true");
  await umzug.click();
  await expect(umzug).toHaveAttribute("aria-checked", "false");
  await expect(
    types.getByRole("listitem").filter({ hasText: "Sonderurlaub Umzug" }).locator("summary"),
  ).toContainText("ausgeblendet");

  await page.goto("/admin?monat=2026-11");
  await cell(page, `Ida ${tag}, Donnerstag 26.:`).click({ button: "right" });
  await expect(page.getByRole("menuitemradio", { name: "Sonderurlaub Hochzeit" })).toBeVisible();
  await expect(page.getByRole("menuitemradio", { name: "Sonderurlaub Umzug" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  const idaPage = await browser.newPage();
  await logIn(idaPage, ida, /\/me$/);
  await idaPage.waitForLoadState("networkidle");
  await openDialog(idaPage, "Urlaub beantragen", "Abwesenheit beantragen");
  const art = idaPage.getByRole("dialog").getByLabel("Art");
  await expect(art.getByRole("option", { name: "Sonderurlaub Hochzeit" })).toHaveCount(1);
  await expect(art.getByRole("option", { name: "Sonderurlaub Umzug" })).toHaveCount(0);

  await openSettings(page);
  await umzug.click();
  await expect(umzug).toHaveAttribute("aria-checked", "true");
  await idaPage.reload();
  await idaPage.waitForLoadState("networkidle");
  await openDialog(idaPage, "Urlaub beantragen", "Abwesenheit beantragen");
  await expect(
    idaPage
      .getByRole("dialog")
      .getByLabel("Art")
      .getByRole("option", { name: "Sonderurlaub Umzug" }),
  ).toHaveCount(1);
  await idaPage.close();
});

test("Elternzeit entered for 3 months shows in the grid and can be removed", async ({ page }) => {
  test.slow();
  await logIn(page, boss, /\/admin$/);
  await page.goto(`/admin/employees/${ida.id}`);
  await page.waitForLoadState("networkidle");

  const form = page.getByRole("region", { name: "Zeitraum eintragen" });
  await form.getByLabel("Art").selectOption({ label: "Elternzeit" });
  await form.getByLabel("Von").fill("2028-05-01");
  await form.getByLabel("Bis").fill("2028-07-31");
  await form.getByRole("button", { name: "Eintragen" }).click();
  // May–July 2028: 66 weekdays minus 1.5., Himmelfahrt 25.5., Pfingstmontag 5.6.
  await expect(form.getByRole("status")).toContainText(
    "Elternzeit 1.5.2028–31.7.2028: 63 Tage eingetragen.",
  );

  await page.goto("/admin?monat=2028-06");
  await expect(cell(page, `Ida ${tag}, Donnerstag 1.: Elternzeit`)).toBeVisible();
  await expect(cell(page, `Ida ${tag}, Montag 5.: Pfingstmontag`)).toBeVisible();

  await page.goto(`/admin/employees/${ida.id}`);
  await page.waitForLoadState("networkidle");
  await form.getByLabel("Art").selectOption({ label: "Elternzeit" });
  await form.getByLabel("Von").fill("2028-05-01");
  await form.getByLabel("Bis").fill("2028-07-31");
  page.once("dialog", (d) => d.accept());
  await form.getByRole("button", { name: "Entfernen" }).click();
  await expect(form.getByRole("status")).toContainText("63 Tage entfernt.");
  const { count } = await admin
    .from("absence_days")
    .select("*", { count: "exact", head: true })
    .eq("user_id", ida.id)
    .eq("type", "parental");
  expect(count).toBe(0);
});

test("an extra email recipient can be added and removed", async ({ page }) => {
  const email = `praxis-${tag}@example.org`;
  await logIn(page, boss, /\/admin$/);
  await openSettings(page);
  const section = page.getByRole("region", { name: "E-Mail-Empfänger" });

  await section.getByLabel("E-Mail-Adresse").fill(email.toUpperCase());
  await section.getByRole("button", { name: "Hinzufügen" }).click();
  await expect(section.getByRole("status")).toHaveText(`${email} bekommt ab jetzt die E-Mails.`);
  await expect(section.getByRole("list", { name: "E-Mail-Empfänger" })).toContainText(email);
  await expect(section.getByLabel("E-Mail-Adresse")).toHaveValue("");

  // The same address twice is refused with a message.
  await section.getByLabel("E-Mail-Adresse").fill(email);
  await section.getByRole("button", { name: "Hinzufügen" }).click();
  await expect(section.getByRole("alert")).toHaveText(`${email} steht schon in der Liste.`);

  await section.getByRole("button", { name: `${email} entfernen` }).click();
  await expect(section.getByRole("status")).toHaveText(`${email} entfernt.`);
  await expect(section.getByRole("listitem").filter({ hasText: email })).toHaveCount(0);
});

test("the vacation reminders switch saves on click (R15, R24)", async ({ page }) => {
  await logIn(page, boss, /\/admin$/);
  await openSettings(page);
  const stored = async () =>
    (await admin.from("app_settings").select("reminders").single()).data?.reminders;
  await flip(page, "Urlaubserinnerungen", false);
  expect(await stored()).toBe(false);
  await flip(page, "Urlaubserinnerungen", true);
  expect(await stored()).toBe(true);
});
