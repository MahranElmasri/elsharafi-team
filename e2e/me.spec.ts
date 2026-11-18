import { expect, test, type Page } from "@playwright/test";
import { admin, createAccount, deleteAccount, type TestAccount } from "./accounts";
import { openDialog } from "./dialogs";

const tag = Date.now().toString(36);
let eva: TestAccount; // the employee using the page
let finn: TestAccount; // a colleague in the same group

test.beforeAll(async () => {
  eva = await createAccount("eva", "employee");
  finn = await createAccount("finn", "employee");
  for (const [a, name] of [
    [eva, `Eva ${tag}`],
    [finn, `Finn ${tag}`],
  ] as const) {
    await admin
      .from("profiles")
      .update({
        full_name: name,
        team_id: "arbeiter",
        workdays: [1, 2, 3, 4, 5],
        start_date: "2020-01-01",
      })
      .eq("id", a.id);
  }
  await admin
    .from("leave_allowances")
    .insert({ user_id: eva.id, year: 2026, days: 30, carryover: 0 });
  const { error } = await admin.from("absence_days").insert({
    user_id: finn.id,
    day: "2026-11-18",
    type: "sick",
    amount: 1,
    status: "approved",
  });
  if (error) throw error;
});

test.afterAll(async () => {
  for (const a of [eva, finn]) {
    await admin.from("absence_days").delete().eq("user_id", a.id);
    await admin.from("leave_requests").delete().eq("user_id", a.id);
  }
  // request_leave and report_absence notify every admin, including real local accounts.
  await admin.from("notifications").delete().like("message", `%${tag}%`);
  for (const a of [eva, finn]) await deleteAccount(a);
});

async function logIn(page: Page, account: TestAccount, path = "/me?monat=2026-11") {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Benutzername").fill(account.username);
  await page.getByLabel("Passwort").fill(account.password);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL(/\/me$/, { timeout: 30_000 });
  await page.goto(path);
  await page.waitForLoadState("networkidle"); // the buttons react only once the page is hydrated
}

test("an employee requests vacation, sees it pending and withdraws it", async ({ page }) => {
  test.slow();
  await logIn(page, eva, "/me?monat=2026-12");
  await expect(page.getByRole("heading", { name: "Sie haben noch 30 Tage Urlaub." })).toBeVisible();

  await openDialog(page, "Urlaub beantragen", "Abwesenheit beantragen");
  const dialog = page.getByRole("dialog", { name: "Abwesenheit beantragen" });
  await dialog.getByLabel("Von").fill("2026-12-07");
  await dialog.getByLabel("Bis", { exact: true }).fill("2026-12-09");
  await dialog.getByLabel("Vertretung (freiwillig)").selectOption({ label: `Finn ${tag}` });
  await dialog.getByRole("button", { name: "Beantragen" }).click();
  await expect(page.getByText(/Beantragt: 3 Arbeitstage/)).toBeVisible();
  await expect(dialog).toBeHidden();

  await expect(page.getByRole("heading", { name: "Sie haben noch 27 Tage Urlaub." })).toBeVisible();
  const item = page.getByRole("listitem").filter({ hasText: "Urlaub, 7.–9.12." });
  await expect(item).toContainText("Beantragt");
  await expect(item).toContainText(`Vertretung: Finn ${tag}`);
  await expect(page.getByText("Montag 7.: Urlaub, beantragt")).toBeAttached();

  // The same days again: the database names the first clash.
  await openDialog(page, "Urlaub beantragen", "Abwesenheit beantragen");
  await dialog.getByLabel("Von").fill("2026-12-08");
  await dialog.getByLabel("Bis", { exact: true }).fill("2026-12-08");
  await dialog.getByRole("button", { name: "Beantragen" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Am 8.12.2026 gibt es schon einen Eintrag. Wählen Sie andere Tage.",
  );
  await dialog.getByRole("button", { name: "Abbrechen" }).click();

  await item.getByRole("button", { name: "Antrag zurückziehen" }).click();
  await expect(page.getByText("Antrag zurückgezogen.")).toBeVisible();
  await expect(item).toContainText("Zurückgezogen");
  await expect(page.getByRole("heading", { name: "Sie haben noch 30 Tage Urlaub." })).toBeVisible();
});

test("a sick report is recorded at once and the admins are told", async ({ page }) => {
  test.slow();
  await logIn(page, eva);
  await openDialog(page, "Krank melden", "Krank melden");
  const dialog = page.getByRole("dialog", { name: "Krank melden" });
  await dialog.getByLabel("Von").fill("2026-11-12");
  await dialog.getByLabel("Bis voraussichtlich").fill("2026-11-13");
  await dialog.getByRole("button", { name: "Krank melden" }).click();
  await expect(page.getByText("Krank gemeldet. Gute Besserung.")).toBeVisible();
  await expect(page.getByText("Donnerstag 12.: Krank")).toBeAttached();
  await expect(page.getByText("Freitag 13.: Krank")).toBeAttached();

  const { data } = await admin
    .from("notifications")
    .select("message")
    .like("message", `Eva ${tag}: Krank%`);
  expect(data?.length).toBeGreaterThan(0);
});

test("the team tab shows colleagues as abwesend, never the reason", async ({ page }) => {
  await logIn(page, eva);
  await page.getByRole("link", { name: "Team" }).click();
  await expect(page).toHaveURL(/ansicht=team/);
  const teamList = page.getByRole("list", { name: "Ihre Gruppe" });
  const finnRow = teamList.getByRole("listitem").filter({ hasText: `Finn ${tag}` });
  await expect(finnRow).toContainText("abwesend am 18.");
  await expect(finnRow.getByTitle("18.: abwesend")).toBeVisible();
  await expect(teamList).not.toContainText(/Krank|krank/);
  // Dates above the columns: one per working day of November 2026 (21), from Mo 2. to Mo 30.
  const dates = page.getByTestId("team-date");
  await expect(dates).toHaveCount(21);
  await expect(dates.first()).toHaveText("M2");
  await expect(dates.last()).toHaveText("M30");

  // And back again: the "Mein Kalender" tab leaves the team view.
  await page.getByRole("link", { name: "Mein Kalender" }).click();
  await expect(page).not.toHaveURL(/ansicht=team/);
  await expect(page.getByRole("link", { name: "Mein Kalender" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("the page works at 375 px without sideways scrolling", async ({ page }) => {
  test.slow();
  await page.setViewportSize({ width: 375, height: 800 });
  await logIn(page, eva);
  await expect(page.getByRole("button", { name: "Urlaub beantragen" })).toBeVisible();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(375);
  await openDialog(page, "Urlaub beantragen", "Abwesenheit beantragen");
  const box = await page.getByRole("dialog").boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  // The date fields stay inside the dialog.
  const to = await page.getByRole("dialog").getByLabel("Bis", { exact: true }).boundingBox();
  expect(to!.x + to!.width).toBeLessThanOrEqual(box!.x + box!.width);
  await page.getByRole("dialog").getByRole("button", { name: "Abbrechen" }).click();

  // The open bell stays on screen.
  await page.getByRole("button", { name: /^Meldungen/ }).click();
  const list = await page.locator("#notices").boundingBox();
  expect(list!.x).toBeGreaterThanOrEqual(0);
  expect(list!.x + list!.width).toBeLessThanOrEqual(375);
});
