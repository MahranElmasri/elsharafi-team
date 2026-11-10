import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { admin, createAccount, deleteAccount, type TestAccount } from "./accounts";

let boss: TestAccount;
let staff: TestAccount;

test.beforeAll(async () => {
  boss = await createAccount("leitung", "admin");
  staff = await createAccount("anna", "employee", true);
});

test.afterAll(async () => {
  await deleteAccount(boss);
  await deleteAccount(staff);
});

async function logIn(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Benutzername").fill(username);
  await page.getByLabel("Passwort").fill(password);
  await page.getByRole("button", { name: "Anmelden" }).click();
}

// Next.js adds its own empty role="alert" route announcer outside <main>.
const alertIn = (page: Page) => page.locator("main").getByRole("alert");

test("public sign-up is refused", async () => {
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  const { data, error } = await anon.auth.signUp({
    email: `fremd-${Date.now()}@example.org`,
    password: "Test-Passwort-123",
  });
  expect(error).not.toBeNull();
  expect(data.user).toBeNull();
});

test("signed-out visitors are sent to the login page", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login$/);
});

test("an admin logs in to /admin and logs out again", async ({ page }) => {
  await logIn(page, boss.username, boss.password);
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("table")).toBeVisible(); // the month grid

  await page.getByRole("button", { name: "Abmelden" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login$/);
});

test("an employee lands on /me and cannot open /admin", async ({ page }) => {
  await logIn(page, staff.username.toUpperCase(), staff.password);
  await expect(page).toHaveURL(/\/me$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/me$/);
});

test("a wrong password and an unknown username give the same answer", async ({ page }) => {
  const message = "Benutzername oder Passwort stimmt nicht. Prüfen Sie beide Angaben.";
  await logIn(page, staff.username, "falsches-passwort");
  await expect(alertIn(page)).toHaveText(message);
  await logIn(page, "gibt-es-nicht", "falsches-passwort");
  await expect(alertIn(page)).toHaveText(message);
});

test("a deactivated account is signed out and cannot log in", async ({ page }) => {
  const kai = await createAccount("kai", "employee");
  try {
    await logIn(page, kai.username, kai.password);
    await expect(page).toHaveURL(/\/me$/);

    await admin.from("profiles").update({ active: false }).eq("id", kai.id);

    await page.reload();
    await expect(page).toHaveURL(/\/login\?gesperrt=1$/);
    await expect(alertIn(page)).toContainText("Ihr Konto ist deaktiviert");

    await logIn(page, kai.username, kai.password);
    await expect(alertIn(page)).toContainText("stimmt nicht");
    await expect(page).toHaveURL(/\/login/);
  } finally {
    await deleteAccount(kai);
  }
});
