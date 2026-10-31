import { expect, test } from "@playwright/test";

// e2e runs with Supabase off, so the reset flow itself can't be exercised here.
// Make sure auth-looking URLs (reset / confirm links) don't break local mode.
test.describe("Auth links with cloud sync off", () => {
  for (const path of [
    "/?code=abc123",
    "/?token_hash=h1&type=recovery",
    "/#access_token=t&refresh_token=r&type=recovery",
  ]) {
    test(`landing still works for ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByTestId("landing-open")).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Set a new password" }),
      ).toHaveCount(0);
      const local = page.getByTestId("landing-local");
      if (await local.isVisible()) await local.click();
      else await page.getByTestId("landing-open").click();
      await expect(page.getByTestId("first-use")).toBeVisible();
    });
  }
});
