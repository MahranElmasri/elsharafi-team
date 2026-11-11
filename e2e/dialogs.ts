import { expect, type Page } from "@playwright/test";

/**
 * Clicks a button that opens a dialog and retries until the dialog is open. In dev, a
 * Fast Refresh rebuild (triggered by another test compiling a page) can reload the page
 * right after the click and close the dialog again.
 */
export async function openDialog(page: Page, button: string, dialog: string) {
  await expect(async () => {
    await page.getByRole("button", { name: button, exact: true }).click();
    await expect(page.getByRole("dialog", { name: dialog })).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}
