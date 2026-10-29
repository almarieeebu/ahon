import { expect, type Page, test } from "@playwright/test";

function visible(page: Page, testId: string) {
  return page.getByTestId(testId).filter({ visible: true });
}

async function enterLog(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("landing-open")).toBeVisible();
  const local = page.getByTestId("landing-local");
  if (await local.isVisible()) await local.click();
  else await page.getByTestId("landing-open").click();
  await page.getByTestId("quick-start-skip").click();
  await page.getByTestId("tab-ledger").click();
}

test.describe("Add expense", () => {
  test("validates, saves once, then offers Edit and Add another", async ({ page }) => {
    await enterLog(page);
    await page.getByTestId("log-add-expense").click();
    await expect(page.getByRole("heading", { name: "Add expense" })).toBeVisible();

    // No category is preselected: saving without one shows inline errors.
    await page.getByTestId("log-amount").fill("120");
    await page.getByTestId("log-save").click();
    await expect(page.getByText("Choose a category.").first()).toBeVisible();

    // Details keep typed values when collapsed and reopened.
    await page.getByTestId("log-details-toggle").click();
    await page.getByTestId("log-note").fill("jeep");
    await page.getByTestId("log-details-toggle").click();
    await page.getByTestId("log-details-toggle").click();
    await expect(page.getByTestId("log-note")).toHaveValue("jeep");

    await page.getByRole("button", { name: "Transport" }).click();
    // Two submits in the same tick (double tap) must save one entry.
    await page.getByTestId("log-save").evaluate((el: HTMLElement) => {
      el.click();
      el.click();
    });
    await expect(page.getByTestId("log-add-another")).toBeVisible();

    await page.getByTestId("log-edit-saved").click();
    await expect(page.getByTestId("log-amount")).toHaveValue("120");
    await page.getByTestId("log-amount").fill("130");
    await page.getByTestId("log-save").click();
    await page.getByTestId("log-done").click();

    await expect(visible(page, "log-row-amount")).toHaveCount(1);
    await expect(visible(page, "log-row-amount")).toContainText("130");
  });

  test("blocks an utang payment when there is no loan", async ({ page }) => {
    await enterLog(page);
    await page.getByTestId("log-add-expense").click();
    await page.getByTestId("log-amount").fill("500");
    await page.getByRole("button", { name: "Utang" }).click();
    await expect(page.getByTestId("log-no-loans")).toBeVisible();
    await page.getByTestId("log-save").click();
    await expect(page.getByTestId("log-add-another")).toHaveCount(0);
  });
});
