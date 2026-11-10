import { createHash, randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { admin, createAccount, deleteAccount, type TestAccount } from "./accounts";

let person: TestAccount;

test.beforeAll(async () => {
  person = await createAccount("neu", "employee", true);
});

test.afterAll(async () => {
  await deleteAccount(person);
});

/** What "Einladung erstellen" does: a token, stored as its hash. */
async function invite(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  const { error } = await admin.rpc("create_invite", {
    p_user: userId,
    p_purpose: "invite",
    p_hash: hash,
  });
  if (error) throw error;
  return { path: `/einladung/${token}`, hash };
}

const alertIn = (page: import("@playwright/test").Page) => page.locator("main").getByRole("alert");

test("an invite link sets the password, signs in, and works only once", async ({ page }) => {
  const link = await invite(person.id);
  await page.goto(link.path);
  await expect(page.getByText(`Guten Tag, Test neu.`)).toBeVisible();

  await page.getByLabel("Neues Passwort").fill("Mein-Passwort-2026");
  await page.getByLabel("Passwort wiederholen").fill("Mein-Passwort-2027");
  await page.getByRole("button", { name: "Passwort speichern" }).click();
  await expect(alertIn(page)).toContainText("nicht gleich");

  await page.getByLabel("Neues Passwort").fill("Mein-Passwort-2026");
  await page.getByLabel("Passwort wiederholen").fill("Mein-Passwort-2026");
  await page.getByRole("button", { name: "Passwort speichern" }).click();
  await expect(page).toHaveURL(/\/me$/);

  await page.getByRole("button", { name: "Abmelden" }).click();
  await page.goto(link.path);
  await expect(alertIn(page)).toHaveText(
    "Dieser Link wurde schon benutzt. Bitten Sie die Praxisleitung um einen neuen Link.",
  );

  // The new password works for a normal login.
  await page.goto("/login");
  await page.getByLabel("Benutzername").fill(person.username);
  await page.getByLabel("Passwort").fill("Mein-Passwort-2026");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL(/\/me$/);
});

test("an expired link is refused", async ({ page }) => {
  const link = await invite(person.id);
  await admin
    .from("invite_tokens")
    .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
    .eq("token_hash", link.hash);
  await page.goto(link.path);
  await expect(alertIn(page)).toHaveText(
    "Dieser Link ist abgelaufen. Bitten Sie die Praxisleitung um einen neuen Link.",
  );
});

test("Passwort vergessen answers the same for known and unknown usernames", async ({ page }) => {
  const answers: string[] = [];
  for (const username of ["gibt-es-nicht", person.username]) {
    await page.goto("/login");
    await page.getByRole("link", { name: "Passwort vergessen?" }).click();
    await expect(page).toHaveURL(/\/passwort-vergessen$/);
    // Dev mode compiles on first visit; submit only once the form is interactive.
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Benutzername").fill(username);
    await page.getByRole("button", { name: "Link anfordern" }).click();
    const status = page.locator("main").getByRole("status");
    await expect(status).toBeVisible();
    answers.push((await status.textContent()) ?? "");
  }
  expect(answers[0]).toBe(answers[1]);
  expect(answers[0]).toContain("Praxisleitung");

  const { count } = await admin
    .from("invite_tokens")
    .select("id", { count: "exact", head: true })
    .eq("user_id", person.id)
    .eq("purpose", "reset");
  expect(count).toBe(1);
});
