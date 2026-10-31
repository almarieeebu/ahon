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

test.describe("Transfer", () => {
  test("moves money between wallets and logs the fee as spending", async ({ page }) => {
    await enterApp(page);

    await page.getByTestId("log-add").click();
    await page.getByTestId("log-mode-transfer").click();
    await page.getByTestId("log-amount").fill("1000");
    await page.getByTestId("log-move-from").selectOption("cash-on-hand");
    await page.getByTestId("log-move-to").selectOption("tigum-emergency");

    // Same wallet on both sides is not allowed.
    await page.getByTestId("log-move-to").selectOption("cash-on-hand");
    await page.getByTestId("log-save").click();
    await expect(page.getByText("Choose a different wallet to move money into.", { exact: true })).toBeVisible();
    await page.getByTestId("log-move-to").selectOption("tigum-emergency");

    await page.getByTestId("log-move-fee").fill("10");
    await page.getByTestId("log-save").click();
    await expect(page.getByTestId("log-saved-fee")).toContainText("10");
    await page.getByTestId("log-done").click();

    const amounts = visible(page, "log-row-amount");
    await expect(amounts).toHaveCount(2);
    await expect(amounts.filter({ hasText: "1,000" })).toHaveCount(1);
    await expect(amounts.filter({ hasText: /₱10\.00$|₱10$/ })).toHaveCount(1);

    // Editing the transfer brings its fee along; changing it updates both rows.
    await visible(page, "log-row").filter({ hasText: "1,000" }).click();
    await visible(page, "log-edit").click();
    await expect(page.getByRole("heading", { name: "Update log" })).toBeVisible();
    await expect(page.getByTestId("log-move-fee")).toHaveValue("10");
    await page.getByTestId("log-move-fee").fill("15");
    await page.getByTestId("log-save").click();
    await page.getByTestId("log-done").click();

    await expect(amounts).toHaveCount(2);
    await expect(amounts.filter({ hasText: "15" })).toHaveCount(1);
    await expect(amounts.filter({ hasText: /₱10\.00$|₱10$/ })).toHaveCount(0);
  });
});
