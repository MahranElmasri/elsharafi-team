import { expect, test, type Page } from "@playwright/test";
import { admin, createAccount, deleteAccount, type TestAccount } from "./accounts";

const tag = Date.now().toString(36);
let boss: TestAccount;
let nora: TestAccount; // asks for leave
let olaf: TestAccount; // same group, already away

async function pendingRequest(user: string, days: string[], type = "vacation") {
  const { data, error } = await admin
    .from("leave_requests")
    .insert({ user_id: user, type, start_date: days[0], end_date: days.at(-1), status: "pending" })
    .select("id")
    .single();
  if (error) throw error;
  const { error: dayError } = await admin.from("absence_days").insert(
    days.map((day) => ({
      user_id: user,
      day,
      type,
      amount: 1,
      status: "pending",
      request_id: data.id,
    })),
  );
  if (dayError) throw dayError;
  return data.id as string;
}

async function requestStatus(id: string) {
  const { data } = await admin
    .from("leave_requests")
    .select("status, decision_note")
    .eq("id", id)
    .single();
  return data;
}

test.beforeAll(async () => {
  boss = await createAccount("chefin", "admin");
  nora = await createAccount("nora", "employee");
  olaf = await createAccount("olaf", "employee");
  for (const [a, name] of [
    [nora, `Nora ${tag}`],
    [olaf, `Olaf ${tag}`],
  ] as const) {
    await admin
      .from("profiles")
      .update({
        full_name: name,
        team_id: "verwaltung",
        workdays: [1, 2, 3, 4, 5],
        start_date: "2020-01-01",
      })
      .eq("id", a.id);
  }
  await admin
    .from("leave_allowances")
    .insert({ user_id: nora.id, year: 2026, days: 30, carryover: 0 });
  const { error } = await admin.from("absence_days").insert(
    ["2026-12-15", "2026-12-16"].map((day) => ({
      user_id: olaf.id,
      day,
      type: "vacation",
      amount: 1,
      status: "approved",
    })),
  );
  if (error) throw error;
});

test.afterAll(async () => {
  for (const a of [nora, olaf]) {
    await admin.from("absence_days").delete().eq("user_id", a.id);
    await admin.from("leave_requests").delete().eq("user_id", a.id);
  }
  for (const a of [boss, nora, olaf]) await deleteAccount(a);
});

async function openAdmin(page: Page, path = "/admin?monat=2026-12") {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Benutzername").fill(boss.username);
  await page.getByLabel("Passwort").fill(boss.password);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto(path);
}

test("a request shows the overlap in its group, then gets approved", async ({ page }) => {
  const id = await pendingRequest(nora.id, ["2026-12-14", "2026-12-15", "2026-12-16"]);
  await openAdmin(page);
  await page.getByRole("button", { name: /^Offene Anträge \d+$/ }).click();
  const drawer = page.getByRole("dialog", { name: "Offene Anträge" });
  const card = drawer.getByRole("article", { name: `Nora ${tag}` });
  await expect(card).toContainText("Urlaub, 14.–16.12.2026, 3 Arbeitstage");
  await expect(card).toContainText("Danach 27 Tage Resturlaub");
  await expect(card.getByRole("list", { name: "Warnungen" })).toContainText(
    `Olaf ${tag}: Urlaub 15.–16.12.`,
  );

  await card.getByLabel(`Nachricht an Nora ${tag} (freiwillig)`).fill("Schönen Urlaub");
  await card.getByRole("button", { name: "Genehmigen" }).click();
  await expect(drawer.getByRole("status")).toHaveText(`Genehmigt: Nora ${tag}, 14.–16.12.`);
  await expect(card).toHaveCount(0);
  expect(await requestStatus(id)).toEqual({ status: "approved", decision_note: "Schönen Urlaub" });

  // The grid's pencil turns to ink.
  await page.keyboard.press("Escape");
  await page.getByPlaceholder("Name suchen").fill(`Nora ${tag}`);
  await expect(page.getByRole("button", { name: `Nora ${tag}, Montag 14.: Urlaub` })).toBeVisible();
});

test("a denied request frees its days", async ({ page }) => {
  const id = await pendingRequest(nora.id, ["2026-12-21"], "training");
  await openAdmin(page);
  await page.getByRole("button", { name: /^Offene Anträge \d+$/ }).click();
  const card = page.getByRole("article", { name: `Nora ${tag}` });
  await expect(card).toContainText("Keine Überschneidungen in der Gruppe.");
  await card.getByRole("button", { name: "Ablehnen" }).click();
  await expect(page.getByRole("dialog").getByRole("status")).toContainText("Abgelehnt");
  expect((await requestStatus(id))?.status).toBe("denied");
  const { count } = await admin
    .from("absence_days")
    .select("*", { count: "exact", head: true })
    .eq("request_id", id);
  expect(count).toBe(0);
});

test("clicking a pencilled day in the grid opens its request", async ({ page }) => {
  await pendingRequest(nora.id, ["2026-12-22"]);
  await openAdmin(page);
  await page.getByPlaceholder("Name suchen").fill(`Nora ${tag}`);
  await page.getByRole("button", { name: `Nora ${tag}, Dienstag 22.: Urlaub, beantragt` }).click();
  const drawer = page.getByRole("dialog", { name: "Offene Anträge" });
  await expect(drawer.getByRole("article", { name: `Nora ${tag}` })).toContainText("22.12.2026");
});

test("AU fehlt lists long sick runs until the AU is in", async ({ page }) => {
  const { error } = await admin.from("absence_days").insert(
    ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"].map((day) => ({
      user_id: olaf.id,
      day,
      type: "sick",
      amount: 1,
      status: "approved",
    })),
  );
  if (error) throw error;
  await openAdmin(page, "/admin?monat=2026-11");
  await page.getByRole("button", { name: /^AU fehlt \d+$/ }).click();
  const drawer = page.getByRole("dialog", { name: "AU fehlt" });
  const row = drawer.getByRole("listitem").filter({ hasText: `Olaf ${tag}` });
  await expect(row).toContainText("2.–5.11.2026, 4 Tage ohne AU");
  await row.getByRole("button", { name: "AU liegt vor" }).click();
  await expect(drawer.getByRole("status")).toHaveText(
    `AU liegt vor: Olaf ${tag}, 4 Krankheitstage.`,
  );
  await expect(row).toHaveCount(0);
});

test("the person view shows the year and can cancel an approved request", async ({ page }) => {
  const id = await pendingRequest(nora.id, ["2026-12-28", "2026-12-29"]);
  await admin.from("leave_requests").update({ status: "approved" }).eq("id", id);
  await admin.from("absence_days").update({ status: "approved" }).eq("request_id", id);

  await openAdmin(page, `/admin/employees/${nora.id}?jahr=2026`);
  const section = page.getByRole("region", { name: "Abwesenheiten 2026" });
  await expect(section.getByText("Anspruch", { exact: true })).toBeVisible();
  const item = section.getByRole("listitem").filter({ hasText: "Urlaub, 28.–29.12." });
  await expect(item).toContainText("Genehmigt");
  await item.getByRole("button", { name: "Stornieren" }).click();
  await item.getByLabel("Nachricht (freiwillig)").fill("Praxis geschlossen");
  await item.getByRole("button", { name: "Stornieren" }).click();
  await expect(section.getByRole("status")).toHaveText("Storniert.");
  await expect(item).toContainText("Storniert");
  expect(await requestStatus(id)).toEqual({
    status: "cancelled",
    decision_note: "Praxis geschlossen",
  });
});
