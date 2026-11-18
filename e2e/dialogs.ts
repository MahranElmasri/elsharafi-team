import { expect, type Page } from "@playwright/test";

/**
 * Clicks a button that opens a dialog and retries until the dialog is open. In dev, a
 * Fast Refresh rebuild (triggered by another test compiling a page) can reload the page
 * right after the click and close the dialog again.
 */
export async function openDialog(page: Page, button: string, dialog: string) {
  await expect(async () => {
    // The dialog's own submit button can carry the same name (e.g. "Krank melden"). The opener
    // comes first on the page, and it is clicked only while the dialog is still closed.
    const open = page.getByRole("dialog", { name: dialog });
    if (!(await open.isVisible())) {
      await page.getByRole("button", { name: button, exact: true }).first().click();
    }
    await expect(open).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}
