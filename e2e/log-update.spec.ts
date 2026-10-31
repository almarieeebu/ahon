import { expect, type Page, test } from "@playwright/test";

function visible(page: Page, testId: string) {
  return page.getByTestId(testId).filter({ visible: true });
}

async function enterApp(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("landing-open")).toBeVisible();
  const local = page.getByTestId("landing-local");
  if (await local.isVisible()) await local.click();
  else await page.getByTestId("landing-open").click();
  // Setup is optional: the app opens on Home with first-use actions.
  await expect(page.getByTestId("first-use")).toBeVisible();
  await page.getByTestId("tab-ledger").click();
  await expect(page.getByRole("heading", { name: /This month/ })).toBeVisible();
}

async function logAmount(page: Page, amount: string) {
  await page.getByTestId("log-amount").fill(amount);
  await page.getByRole("button", { name: "Food" }).click();
  await page.getByTestId("log-save").click();
  await page.getByTestId("log-done").click();
}

test.describe("Log update", () => {
  test("creates a log then updates the amount", async ({ page }) => {
    await enterApp(page);

    await page.getByTestId("log-add").click();
    await expect(page.getByRole("heading", { name: "Log money" })).toBeVisible();
    await logAmount(page, "150");
    await expect(visible(page, "log-row-amount")).toContainText("150");

    // Rows open a details panel; Edit is there.
    await visible(page, "log-row").click();
    await visible(page, "log-edit").click();
    await expect(page.getByRole("heading", { name: "Update log" })).toBeVisible();
    await expect(page.getByTestId("log-amount")).toHaveValue("150");
    await page.getByTestId("log-amount").fill("200");
    await page.getByTestId("log-save").click();
    await page.getByTestId("log-done").click();

    await expect(visible(page, "log-row-amount")).toContainText("200");
    await expect(visible(page, "log-row-amount")).not.toContainText("150");
  });

  test("updates a log from More details without resetting the amount", async ({
    page,
  }) => {
    await enterApp(page);

    await page.getByTestId("log-add").click();
    await logAmount(page, "150");

    // Rows open a details panel; Edit is there.
    await visible(page, "log-row").click();
    await visible(page, "log-edit").click();
    await page.getByRole("button", { name: "More details" }).click();
    await expect(page.getByTestId("record-amount")).toHaveValue("150");
    await page.getByTestId("record-amount").fill("175");
    await page.getByTestId("record-save").click();

    await expect(visible(page, "log-row-amount")).toContainText("175");
    await expect(visible(page, "log-row-amount")).not.toContainText("150");
  });

  test("Money in: Borrowed opens Add loan as new borrowing with the amount", async ({
    page,
  }) => {
    await enterApp(page);

    await page.getByTestId("log-add").click();
    await page.getByRole("button", { name: "Money in" }).click();
    await page.getByTestId("log-amount").fill("5000");
    await expect(page.getByTestId("log-new-category")).toBeVisible();
    await page.getByTestId("log-borrowed").click();

    await expect(page.getByRole("heading", { name: "Log money" })).toHaveCount(0);
    await expect(page.getByTestId("loan-kind-new")).toBeChecked();
    await expect(page.getByTestId("loan-amount")).toHaveValue("5000");
  });
});
