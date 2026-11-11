import { expect, test, type Page } from "@playwright/test";
import { admin, createAccount, deleteAccount, type TestAccount } from "./accounts";

// A closure reaches every active person, so it lies far away from all other tests' dates
// and is removed again at the end.
const tag = Date.now().toString(36);
let boss: TestAccount;
let paul: TestAccount;

// The audit test reads what the closure test wrote.
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  boss = await createAccount("schliess", "admin");
  paul = await createAccount("paul", "employee");
  await admin
    .from("profiles")
    .update({ full_name: `Boss ${tag}` })
    .eq("id", boss.id);
  await admin
    .from("profiles")
    .update({ full_name: `Paul ${tag}`, workdays: [1, 2, 3, 4, 5], start_date: "2020-01-01" })
    .eq("id", paul.id);
  const { error } = await admin
    .from("absence_days")
    .insert({ user_id: paul.id, day: "2028-03-14", type: "sick", amount: 1, status: "approved" });
  if (error) throw error;
});

test.afterAll(async () => {
  // Leftovers if a test failed halfway.
  await admin
    .from("absence_days")
    .delete()
    .eq("type", "closure")
    .gte("day", "2028-03-13")
    .lte("day", "2028-03-15");
  await admin.from("closure_days").delete().gte("day", "2028-03-13").lte("day", "2028-03-15");
  await admin.from("absence_days").delete().eq("user_id", paul.id);
  for (const a of [boss, paul]) await deleteAccount(a);
});

async function logIn(page: Page, account: TestAccount, home: RegExp) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Benutzername").fill(account.username);
  await page.getByLabel("Passwort").fill(account.password);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL(home, { timeout: 30_000 });
}

async function paulDays() {
  const { data } = await admin
    .from("absence_days")
    .select("day, type")
    .eq("user_id", paul.id)
    .order("day");
  return data ?? [];
}

test("a closure is entered once for everyone, repeats safely, and can be removed", async ({
  page,
}) => {
  test.slow();
  await logIn(page, boss, /\/admin$/);
  await page.getByRole("link", { name: "Schließungen" }).click();
  await expect(page.getByRole("heading", { name: "Schließungen", level: 1 })).toBeVisible();
  await page.waitForLoadState("networkidle");

  const form = page.getByRole("region", { name: "Schließung eintragen" });
  await form.getByLabel("Von").fill("2028-03-13");
  await form.getByLabel("Bis").fill("2028-03-15");
  await form.getByLabel("Notiz (freiwillig)").fill(`Umbau ${tag}`);
  await form.getByRole("button", { name: "Schließung eintragen" }).click();
  await expect(form.getByRole("status")).toContainText("Eingetragen: 3 Schließtage");
  await expect(form.getByRole("list", { name: "Übersprungene Tage" })).toContainText(
    `Paul ${tag}: Krank 14.3.`,
  );
  expect(await paulDays()).toEqual([
    { day: "2028-03-13", type: "closure" },
    { day: "2028-03-14", type: "sick" },
    { day: "2028-03-15", type: "closure" },
  ]);

  // Again: nothing new.
  await form.getByRole("button", { name: "Schließung eintragen" }).click();
  await expect(form.getByRole("status")).toContainText("0 neue Einträge");
  expect(await paulDays()).toHaveLength(3);

  await page.goto("/admin/closures?jahr=2028");
  const list = page.getByRole("region", { name: "Schließungen 2028" });
  const item = list.getByRole("listitem").filter({ hasText: "13.–15.3.2028" });
  await expect(item).toContainText(`3 Schließtage, Umbau ${tag}`);

  page.once("dialog", (d) => d.accept());
  await item.getByRole("button", { name: "Entfernen" }).click();
  // The page refreshes and the range leaves the list.
  await expect(list).toContainText("Für 2028 ist keine Schließung eingetragen.");
  expect(await paulDays()).toEqual([{ day: "2028-03-14", type: "sick" }]);
});

test("the audit log shows who changed what, filtered by person", async ({ page }) => {
  await logIn(page, boss, /\/admin$/);
  await page.getByRole("link", { name: "Protokoll" }).click();
  await page.getByLabel("Person", { exact: true }).selectOption({ label: `Paul ${tag}` });
  await page.getByLabel("Bereich", { exact: true }).selectOption({ label: "Abwesenheiten" });
  await page.getByRole("button", { name: "Anzeigen" }).click();
  await expect(page).toHaveURL(new RegExp(`person=${paul.id}`));

  const rows = page.getByRole("row");
  // The sick day came in through the service role: no person, so "System".
  await expect(
    rows.filter({ hasText: `Paul ${tag}, 14.3.2028: angelegt` }).filter({ hasText: "System" }),
  ).toContainText("Art: Krank");
  // The closure was entered by the admin and removed again.
  await expect(
    rows.filter({ hasText: `Paul ${tag}, 13.3.2028: angelegt` }).filter({ hasText: `Boss ${tag}` }),
  ).toContainText("Art: Betriebsurlaub");
  await expect(rows.filter({ hasText: `Paul ${tag}, 13.3.2028: gelöscht` })).toHaveCount(1);
});

test("employees cannot open the closures or the audit log", async ({ page }) => {
  await logIn(page, paul, /\/me$/);
  for (const path of ["/admin/closures", "/admin/audit"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/me$/);
  }
});
