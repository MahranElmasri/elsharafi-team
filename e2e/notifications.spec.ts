import { expect, test, type Page } from "@playwright/test";
import { admin, createAccount, deleteAccount, type TestAccount } from "./accounts";
import { openDialog } from "./dialogs";

const tag = Date.now().toString(36);
let boss: TestAccount;
let ida: TestAccount;

test.beforeAll(async () => {
  boss = await createAccount("leiterin", "admin");
  ida = await createAccount("ida", "employee");
  await admin
    .from("profiles")
    .update({
      full_name: `Ida ${tag}`,
      team_id: "aerzte",
      workdays: [1, 2, 3, 4, 5],
      start_date: "2020-01-01",
    })
    .eq("id", ida.id);
  await admin
    .from("leave_allowances")
    .insert({ user_id: ida.id, year: 2026, days: 30, carryover: 0 });
});

test.afterAll(async () => {
  await admin.from("absence_days").delete().eq("user_id", ida.id);
  await admin.from("leave_requests").delete().eq("user_id", ida.id);
  await admin.from("notifications").delete().like("message", `%${tag}%`);
  for (const a of [boss, ida]) await deleteAccount(a);
});

/** Logs in and waits until the bell's Realtime subscription is live. */
async function logIn(page: Page, account: TestAccount, home: RegExp) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  // Only Realtime's socket counts; the dev server opens its own for hot reload.
  const subscribed = page
    .waitForEvent("websocket", {
      predicate: (ws) => ws.url().includes("/realtime/"),
      timeout: 30_000,
    })
    .then((ws) =>
      ws.waitForEvent("framereceived", {
        predicate: (f) => String(f.payload).includes("Subscribed to PostgreSQL"),
        timeout: 30_000,
      }),
    );
  await page.getByLabel("Benutzername").fill(account.username);
  await page.getByLabel("Passwort").fill(account.password);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL(home, { timeout: 30_000 });
  await subscribed;
}

const bell = (page: Page) => page.getByRole("button", { name: /^Meldungen/ });

test("the bell updates live and opening it marks everything read", async ({ page }) => {
  await logIn(page, ida, /\/me$/);
  await expect(bell(page)).toHaveAccessibleName("Meldungen");

  await admin.from("notifications").insert({
    user_id: ida.id,
    message: `Ihr Antrag ${tag} wurde genehmigt.`,
    link: "/me",
  });
  await expect(bell(page)).toHaveAccessibleName("Meldungen, 1 neu");
  await expect(page.getByRole("status").filter({ hasText: "Neue Meldung" })).toHaveText(
    `Neue Meldung: Ihr Antrag ${tag} wurde genehmigt.`,
  );

  await bell(page).click();
  await expect(page.getByRole("list", { name: "Letzte Meldungen" })).toContainText(
    `Ihr Antrag ${tag} wurde genehmigt.`,
  );
  await expect(bell(page)).toHaveAccessibleName("Meldungen");
  await expect
    .poll(async () => {
      const { data } = await admin.from("notifications").select("read_at").eq("user_id", ida.id);
      return data?.every((n) => n.read_at !== null);
    })
    .toBe(true);

  // A reload keeps it read.
  await page.reload();
  await expect(bell(page)).toHaveAccessibleName("Meldungen");
});

test("a request rings the admin's bell; the decision rings the employee's", async ({ browser }) => {
  test.slow();
  const bossPage = await (await browser.newContext()).newPage();
  const idaPage = await (await browser.newContext()).newPage();
  await logIn(bossPage, boss, /\/admin$/);
  await logIn(idaPage, ida, /\/me$/);
  const before = await bossPage.getByRole("button", { name: /^Offene Anträge \d+$/ }).textContent();

  await openDialog(idaPage, "Urlaub beantragen", "Abwesenheit beantragen");
  const dialog = idaPage.getByRole("dialog", { name: "Abwesenheit beantragen" });
  await dialog.getByLabel("Von").fill("2026-12-03");
  await dialog.getByLabel("Bis", { exact: true }).fill("2026-12-04");
  await dialog.getByRole("button", { name: "Beantragen" }).click();
  await expect(idaPage.getByText(/Beantragt: 2 Arbeitstage/)).toBeVisible();

  // Live on the admin's open page, with no reload: the bell and the request count (R18).
  await expect(bossPage.getByRole("button", { name: /^Meldungen, \d+ neu$/ })).toBeVisible();
  await expect(bossPage.getByRole("button", { name: /^Offene Anträge \d+$/ })).not.toHaveText(
    before!,
  );
  await bell(bossPage).click();
  await expect(
    bossPage.getByRole("list", { name: "Letzte Meldungen" }).getByRole("link", {
      name: new RegExp(`Ida ${tag} hat Urlaub beantragt: 3\\.12\\.–4\\.12\\.2026`),
    }),
  ).toBeVisible();
  await bell(bossPage).click();
  await bossPage.getByRole("button", { name: /^Offene Anträge \d+$/ }).click();
  await bossPage
    .getByRole("article", { name: `Ida ${tag}` })
    .getByRole("button", { name: "Genehmigen" })
    .click();
  await expect(bossPage.getByRole("dialog").getByRole("status")).toContainText("Genehmigt");

  // Live on the employee's open page, with no reload: the bell and the request list (R18).
  await expect(idaPage.getByRole("button", { name: "Meldungen, 1 neu" })).toBeVisible();
  await expect(idaPage.getByRole("listitem").filter({ hasText: "Urlaub, 3.–4.12." })).toContainText(
    "Genehmigt",
  );
  await bell(idaPage).click();
  await expect(idaPage.getByRole("list", { name: "Letzte Meldungen" })).toContainText(
    "Ihr Antrag Urlaub 3.12.–4.12.2026 wurde genehmigt.",
  );
});
