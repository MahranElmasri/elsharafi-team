import ExcelJS from "exceljs";
import { expect, test, type Page } from "@playwright/test";
import { admin, createAccount, deleteAccount, type TestAccount } from "./accounts";

const tag = Date.now().toString(36);
let boss: TestAccount;
let olga: TestAccount;

test.beforeAll(async () => {
  boss = await createAccount("export", "admin");
  olga = await createAccount("olga", "employee");
  await admin
    .from("profiles")
    .update({ full_name: `Olga ${tag}`, workdays: [1, 2, 3, 4, 5], start_date: "2020-01-01" })
    .eq("id", olga.id);
  await admin
    .from("leave_allowances")
    .insert({ user_id: olga.id, year: 2026, days: 30, carryover: 0 });
  const { error } = await admin.from("absence_days").insert([
    { user_id: olga.id, day: "2026-11-02", type: "sick", amount: 1, status: "approved" },
    { user_id: olga.id, day: "2026-11-03", type: "sick", amount: 1, status: "approved" },
    {
      user_id: olga.id,
      day: "2026-11-04",
      type: "vacation",
      amount: 0.5,
      half: "am",
      status: "approved",
    },
  ]);
  if (error) throw error;
});

test.afterAll(async () => {
  await admin.from("absence_days").delete().eq("user_id", olga.id);
  for (const a of [boss, olga]) await deleteAccount(a);
});

async function logIn(page: Page, account: TestAccount, home: RegExp) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Benutzername").fill(account.username);
  await page.getByLabel("Passwort").fill(account.password);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL(home, { timeout: 30_000 });
}

test("the Excel export matches the grid", async ({ page }) => {
  test.slow(); // the dev server builds the export route on first use
  await logIn(page, boss, /\/admin$/);
  await page.goto("/admin?monat=2026-11");
  const row = page.getByRole("row").filter({ hasText: `Olga ${tag}` });
  await expect(row.getByRole("button", { name: `Olga ${tag}, Montag 2.: Krank` })).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Excel 2026" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("Anwesenheit-2026.xlsx");

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(await file.path());
  const nov = wb.getWorksheet("November")!;
  const header = nov.getRow(2).values as unknown[];
  let olgaRow: ExcelJS.Row | undefined;
  nov.eachRow((r) => {
    if (r.getCell(1).value === `Olga ${tag}`) olgaRow = r;
  });
  expect(olgaRow).toBeDefined();
  expect(olgaRow!.getCell(header.indexOf(2)).value).toBe("X");
  expect(olgaRow!.getCell(header.indexOf(3)).value).toBe("X");
  expect(olgaRow!.getCell(header.indexOf(4)).value).toBe("½U");
  expect((olgaRow!.values as unknown[]).slice(-3)).toEqual([2, 0.5, 0]);

  let yearRow: unknown[] = [];
  wb.getWorksheet("Jahr")!.eachRow((r) => {
    if (r.getCell(1).value === `Olga ${tag}`) yearRow = r.values as unknown[];
  });
  expect(yearRow.slice(1)).toEqual([`Olga ${tag}`, 30, 0, 0, 0.5, 0, 29.5, 2]);
});

test("the backup holds every table and is admin-only", async ({ page, browser }) => {
  test.slow(); // two logins and a large download on a dev server
  await logIn(page, boss, /\/admin$/);
  const res = await page.request.get("/admin/backup");
  expect(res.status()).toBe(200);
  expect(res.headers()["cache-control"]).toContain("no-store");
  expect(res.headers()["content-disposition"]).toMatch(/Sicherung-\d{4}-\d{2}-\d{2}\.json/);
  const backup = await res.json();
  expect(Object.keys(backup.tables)).toEqual(
    expect.arrayContaining(["profiles", "absence_days", "leave_requests", "audit_log"]),
  );
  expect(backup.tables).not.toHaveProperty("invite_tokens");
  expect(
    backup.tables.absence_days.filter((d: { user_id: string }) => d.user_id === olga.id),
  ).toHaveLength(3);

  const other = await browser.newPage();
  await logIn(other, olga, /\/me$/);
  for (const path of ["/admin/backup", "/admin/export"]) {
    const r = await other.request.get(path, { maxRedirects: 0 });
    expect(r.status(), path).not.toBe(200);
  }
  await other.close();
});
