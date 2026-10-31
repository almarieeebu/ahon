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
  await expect(page.getByTestId("first-use")).toBeVisible();
  await page.getByTestId("tab-ledger").click();
  await expect(page.getByRole("heading", { name: /This month/ })).toBeVisible();
}

test.describe("Activity filters", () => {
  test("filters by account and date, and shows accounts on rows", async ({ page }) => {
    await enterApp(page);

    // An expense and a wallet transfer.
    await page.getByTestId("log-add").click();
    await page.getByTestId("log-amount").fill("150");
    await page.getByRole("button", { name: "Food" }).click();
    await page.getByTestId("log-save").click();
    await page.getByTestId("log-done").click();

    await page.getByTestId("log-add").click();
    await page.getByTestId("log-mode-transfer").click();
    await page.getByTestId("log-amount").fill("1000");
    await page.getByTestId("log-move-from").selectOption("cash-on-hand");
    await page.getByTestId("log-move-to").selectOption("tigum-emergency");
    await page.getByTestId("log-save").click();
    await page.getByTestId("log-done").click();

    const rows = visible(page, "log-row");
    await expect(rows).toHaveCount(2);

    // Rows name their account; a transfer is neutral, not spending.
    const transfer = rows.filter({ hasText: "1,000" });
    await expect(transfer).toContainText("→");
    const transferAmount = transfer.getByTestId("log-row-amount");
    await expect(transferAmount).toContainText("⇄");
    await expect(transferAmount).not.toContainText("−");
    await expect(rows.filter({ hasText: "150" })).toContainText("from ");

    // Account filter: only the tigum pot's row.
    await page.getByTestId("log-filter-account").selectOption("tigum-emergency");
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText("1,000");
    await expect(page.getByTestId("log-filter-summary")).toContainText("1 matching");
    await expect(page.getByTestId("log-filter-summary")).toContainText("+₱1,000");

    // Date filter: a day with nothing logged.
    await page.getByTestId("log-filter-account").selectOption("");
    await page.getByTestId("log-filter-date-mode").selectOption("day");
    await page.getByTestId("log-filter-day").fill("2000-01-01");
    await expect(page.getByText("Nothing matches these filters.")).toBeVisible();

    // A range that covers everything.
    await page.getByTestId("log-filter-date-mode").selectOption("range");
    await page.getByTestId("log-filter-from").fill("2000-01-01");
    await page.getByTestId("log-filter-to").fill("2099-12-31");
    await expect(rows).toHaveCount(2);
    await expect(page.getByTestId("log-filter-summary")).toContainText("2 matching");

    // Filters combine with the kind chips, and clear resets everything.
    await page.getByRole("button", { name: "Spending" }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText("150");
    await page.getByTestId("log-filter-clear").click();
    await expect(page.getByTestId("log-filter-date-mode")).toHaveValue("month");
    await expect(rows).toHaveCount(2);
    await expect(page.getByTestId("log-filter-summary")).toHaveCount(0);
  });
});
