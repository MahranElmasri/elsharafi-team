import { expect, test, type Page } from "@playwright/test";
import { createAccount, deleteAccount, type TestAccount } from "./accounts";

let eva: TestAccount;

test.beforeAll(async () => {
  eva = await createAccount("pwa", "employee");
});

test.afterAll(async () => {
  await deleteAccount(eva);
});

async function logIn(page: Page) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Benutzername").fill(eva.username);
  await page.getByLabel("Passwort").fill(eva.password);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL(/\/me$/, { timeout: 30_000 });
}

test("the manifest and service worker load without a session", async ({ request }) => {
  const manifest = await request.get("/manifest.webmanifest", { maxRedirects: 0 });
  expect(manifest.status()).toBe(200);
  expect(await manifest.json()).toMatchObject({
    short_name: "Anwesenheit",
    display: "standalone",
    start_url: "/",
  });
  const sw = await request.get("/sw.js", { maxRedirects: 0 });
  expect(sw.status()).toBe(200);
  expect(await sw.text()).toContain('addEventListener("push"');
  expect((await request.post("/api/push", { data: { ids: [] }, maxRedirects: 0 })).status()).toBe(
    401,
  );
});

test("the Meldungen panel offers push for this device", async ({ page }) => {
  test.slow();
  await logIn(page);
  // Registered on page load, before the panel is opened.
  await expect
    .poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration("/"))))
    .toBe(true);
  await page.getByRole("button", { name: /^Meldungen/ }).click();
  await expect(
    page.getByRole("switch", { name: "Auf diesem Gerät benachrichtigen" }),
  ).toHaveAttribute("aria-checked", "false");
  await expect
    .poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration("/"))))
    .toBe(true);
});

test.describe("on an iPhone in the browser", () => {
  test.use({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  });

  test("it explains to add the app to the home screen first", async ({ page }) => {
    test.slow();
    await logIn(page);
    await page.getByRole("button", { name: /^Meldungen/ }).click();
    await expect(page.getByText("Zum Home-Bildschirm")).toBeVisible();
    await expect(
      page.getByRole("switch", { name: "Auf diesem Gerät benachrichtigen" }),
    ).toHaveCount(0);
  });
});
