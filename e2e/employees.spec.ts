import { expect, test, type Page } from "@playwright/test";
import { admin, createAccount, deleteAccount, type TestAccount } from "./accounts";

let boss: TestAccount;
let withEntries: TestAccount;
const stamp = Date.now().toString(36);
const newUsername = `neu.${stamp}`;

test.beforeAll(async () => {
  boss = await createAccount("leitung", "admin");
  withEntries = await createAccount("eintrag", "employee");
  await admin
    .from("absence_days")
    .insert({ user_id: withEntries.id, day: "2026-11-10", type: "sick" });
});

test.afterAll(async () => {
  await admin.from("absence_days").delete().eq("user_id", withEntries.id);
  await deleteAccount(withEntries);
  await deleteAccount(boss);
  const { data } = await admin.from("profiles").select("id").like("username", `%${stamp}%`);
  for (const p of data ?? []) await admin.auth.admin.deleteUser(p.id);
});

async function logIn(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Benutzername").fill(username);
  await page.getByLabel("Passwort").fill(password);
  await page.getByRole("button", { name: "Anmelden" }).click();
}

async function logInAdmin(page: Page) {
  await logIn(page, boss.username, boss.password);
  await expect(page).toHaveURL(/\/admin$/);
}

const alertIn = (page: Page) => page.locator("main").getByRole("alert");
const statusIn = (page: Page) => page.locator("main").getByRole("status");

test("the admin adds a person, invites them, and they set their own password", async ({
  page,
  browser,
}) => {
  test.slow(); // two browsers and several first-time page compiles
  await logInAdmin(page);
  await page.getByRole("link", { name: "Mitarbeitende" }).click();
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Name", { exact: true }).fill("Nora Neu");
  await page.getByLabel("Benutzername").fill(newUsername);
  await page.getByLabel("Gruppe").selectOption("aerzte");
  await page.getByRole("group", { name: "Arbeitstage" }).getByText("Mi").click(); // untick Wednesday
  await page.getByRole("button", { name: "Person hinzufügen" }).click();

  await expect(page.getByRole("heading", { name: "Nora Neu", level: 1 })).toBeVisible();
  await expect(statusIn(page)).toContainText("Angelegt");
  await expect(page.getByRole("img", { name: "Arbeitet Mo, Di, Do, Fr" })).toBeVisible();

  await page.getByRole("button", { name: "Einladung erstellen" }).click();
  await expect(page.getByRole("img", { name: "QR-Code mit dem Einladungslink" })).toBeVisible();
  await expect(page.getByText("Ohne E-Mail-Adresse")).toBeVisible();
  const link = await page.getByLabel("Einladungslink", { exact: true }).inputValue();
  expect(link).toMatch(/\/einladung\/[A-Za-z0-9_-]{43}$/);

  // The new person opens the link on their own phone.
  const phone = await browser.newPage();
  await phone.goto(link);
  await phone.waitForLoadState("networkidle");
  await phone.getByLabel("Neues Passwort").fill("Noras-Passwort-1");
  await phone.getByLabel("Passwort wiederholen").fill("Noras-Passwort-1");
  await phone.getByRole("button", { name: "Passwort speichern" }).click();
  await expect(phone).toHaveURL(/\/me$/);
  await phone.close();

  const { data } = await admin
    .from("profiles")
    .select("team_id, workdays, role")
    .eq("username", newUsername)
    .single();
  expect(data).toEqual({ team_id: "aerzte", workdays: [1, 2, 4, 5], role: "employee" });
});

test("editing checks the username and saves the details", async ({ page }) => {
  await logInAdmin(page);
  await page.goto(`/admin/employees/${withEntries.id}`);
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Benutzername").fill(boss.username);
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(alertIn(page)).toContainText(`Den Benutzernamen „${boss.username}“ gibt es schon.`);

  await page.getByLabel("Benutzername").fill(withEntries.username);
  await page.getByLabel("Name", { exact: true }).fill("Eintrag Geändert");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(statusIn(page)).toHaveText("Gespeichert.");
});

test("someone with entries cannot be deleted, only deactivated", async ({ page, browser }) => {
  await logInAdmin(page);
  await page.goto(`/admin/employees/${withEntries.id}`);
  await page.waitForLoadState("networkidle");

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Löschen" }).click();
  await expect(alertIn(page)).toContainText("hat schon Einträge und kann nicht gelöscht werden");

  await page.getByRole("button", { name: "Deaktivieren" }).click();
  await expect(statusIn(page)).toContainText("Deaktiviert");

  const other = await browser.newPage();
  await logIn(other, withEntries.username, withEntries.password);
  await expect(other.locator("main").getByRole("alert")).toContainText("stimmt nicht");
  await other.close();

  await page.getByRole("button", { name: "Wieder aktivieren" }).click();
  await expect(statusIn(page)).toContainText("Wieder aktiviert");
});

test("the admin's own page has no deactivate or delete", async ({ page }) => {
  await logInAdmin(page);
  await page.goto(`/admin/employees/${boss.id}`);
  await expect(page.getByText("Ihr eigenes Konto können Sie nicht deaktivieren")).toBeVisible();
  await expect(page.getByRole("button", { name: "Löschen" })).toHaveCount(0);
});

test("the allowance takes the §5 BUrlG suggestion", async ({ page }) => {
  await admin
    .from("profiles")
    .update({ workdays: [1, 2, 4], start_date: "2026-07-01" })
    .eq("id", withEntries.id);
  await logInAdmin(page);
  await page.goto(`/admin/employees/${withEntries.id}?jahr=2026`);
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Vorschlag berechnen" }).click();
  await expect(page.getByText("Vorschlag: 9 Tage")).toBeVisible();
  await page.getByRole("button", { name: "Übernehmen" }).click();
  await expect(page.getByLabel("Urlaubstage")).toHaveValue("9");
  await page.getByRole("button", { name: "Anspruch speichern" }).click();
  await expect(statusIn(page)).toHaveText("Anspruch für 2026 gespeichert.");

  const { data } = await admin
    .from("leave_allowances")
    .select("days")
    .eq("user_id", withEntries.id)
    .eq("year", 2026)
    .single();
  expect(Number(data?.days)).toBe(9);
});
