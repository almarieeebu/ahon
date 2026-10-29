import { expect, type Page, test } from "@playwright/test";

async function enterApp(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("landing-open")).toBeVisible();
  const local = page.getByTestId("landing-local");
  if (await local.isVisible()) await local.click();
  else await page.getByTestId("landing-open").click();
  await expect(page.getByTestId("first-use")).toBeVisible();
}

function visible(page: Page, testId: string) {
  return page.getByTestId(testId).filter({ visible: true });
}

test.describe("Navigation", () => {
  test("shows Home, Activity, Budget, Loans and the setup pages", async ({ page }) => {
    await enterApp(page);
    const nav = page.getByRole("navigation", { name: "Main" });
    for (const label of ["Home", "Activity", "Budget", "Loans"]) {
      await expect(nav.getByRole("button", { name: label, exact: true })).toBeVisible();
    }

    await page.getByTestId("tab-utang").click();
    await expect(page.locator("h1")).toHaveText("Loans / Utang");
    await expect(page.getByTestId("tab-utang")).toHaveAttribute("aria-current", "page");

    const wide = (page.viewportSize()?.width ?? 0) >= 1024;
    if (wide) {
      // Wide screens list the More pages directly in the sidebar.
      await expect(page.getByTestId("tab-more")).toBeHidden();
      await expect(nav.getByRole("button", { name: "Savings", exact: true })).toBeVisible();
      await expect(nav.getByRole("button", { name: "Income & recurring bills" })).toBeVisible();
      await expect(nav.getByText("Money plan")).toHaveCount(0);
      return;
    }
    await expect(nav.getByRole("button", { name: "More", exact: true })).toBeVisible();
    await page.getByTestId("tab-more").click();
    const more = page.getByRole("dialog", { name: "More" });
    await expect(more.getByText("Income & recurring bills")).toBeVisible();
    await expect(more.getByText("Savings", { exact: true })).toBeVisible();
    await expect(more.getByText("Money plan")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(more).toHaveCount(0);
  });

  test("fits a 320px wide screen without sideways scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await enterApp(page);
    for (const id of ["tab-home", "tab-ledger", "tab-budget", "tab-utang", "tab-more"]) {
      await expect(page.getByTestId(id)).toBeInViewport();
    }
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("first use can jump straight to the Budget tab", async ({ page }) => {
    await enterApp(page);
    await page.getByTestId("first-set-budget").click();
    await expect(page.locator("h1")).toHaveText("Budget");
  });
});

test.describe("First use", () => {
  test("setup can be skipped and resumed with typed values kept", async ({ page }) => {
    await enterApp(page);
    await page.getByTestId("first-setup").click();
    await page.getByLabel("Monthly take-home pay").fill("25000");
    await page.getByTestId("quick-start-skip").click();
    await expect(page.getByTestId("first-use")).toBeVisible();
    await expect(page.getByTestId("first-setup")).toHaveText(/Continue/);
    // A fresh visit (landing screen again) still finds the draft.
    await enterApp(page);
    await page.getByTestId("first-setup").click();
    await expect(page.getByLabel("Monthly take-home pay")).toHaveValue("25000");
  });
});

test.describe("Loans", () => {
  test("adds an existing loan, then records partial and over payments", async ({ page }) => {
    await enterApp(page);
    await page.getByTestId("tab-utang").click();
    await page.getByTestId("loans-add").click();

    // Name + amount are enough; no preset rate, dates or durations.
    await page.getByTestId("loan-kind-existing").check();
    await page.getByTestId("loan-save").click();
    await expect(page.getByText("Name the loan, like SSS loan or Utang kay Ate.", { exact: true })).toBeVisible();
    await page.getByTestId("loan-name").fill("SSS loan");
    await page.getByTestId("loan-amount").fill("12000");
    await page.getByTestId("loan-details-toggle").click();
    await expect(page.getByTestId("loan-next-due")).toHaveValue("");
    await expect(page.getByTestId("loan-payment")).toHaveValue("");
    await expect(page.getByTestId("loan-payments-left")).toHaveValue("");
    await page.getByTestId("loan-save").click();
    await expect(page.getByTestId("loan-saved")).toContainText("You owe ₱12,000");
    await expect(page.getByTestId("loan-saved")).toContainText("cash did not change");
    await page.getByTestId("loan-done").click();

    await expect(page.getByTestId("loan-owed")).toHaveText("₱12,000");
    await expect(page.getByText("not known")).toBeVisible();

    // Record payment: the loan from this card is prefilled.
    await page.getByTestId("loan-record-payment").click();
    await expect(page.getByTestId("pay-loan").locator("option:checked")).toContainText("SSS loan");
    await page.getByTestId("pay-amount").fill("2000");
    await page.getByTestId("pay-from").selectOption({ label: "Paid from money Ahon does not track" });
    await page.getByTestId("pay-save").click();
    await expect(page.getByTestId("pay-result")).toContainText("₱10,000 still owed");
    await page.getByTestId("pay-done").click();
    await expect(page.getByTestId("loan-owed")).toHaveText("₱10,000");

    // Paying more than is owed needs a review step.
    await page.getByTestId("loan-record-payment").click();
    await page.getByTestId("pay-amount").fill("15000");
    await page.getByTestId("pay-from").selectOption({ label: "Paid from money Ahon does not track" });
    await page.getByTestId("pay-save").click();
    await expect(page.getByTestId("pay-overpay")).toBeVisible();
    await page.getByTestId("pay-confirm-overpay").click();
    await expect(page.getByTestId("pay-result")).toContainText("Nothing left to pay");
    await page.getByTestId("pay-done").click();
    await expect(page.getByTestId("loan-owed")).toHaveText("₱0");
  });

  test("new borrowing from Home raises the wallet and the debt, not income", async ({ page }) => {
    await enterApp(page);
    await page.getByTestId("first-add-loan").click();
    await page.getByTestId("loan-kind-new").check();
    await page.getByTestId("loan-name").fill("Salary loan");
    await page.getByTestId("loan-amount").fill("5000");
    await page.getByTestId("loan-save").click();
    await expect(page.getByText("Choose the wallet that received the money.", { exact: true })).toBeVisible();
    await page.getByTestId("loan-wallet").selectOption({ label: "Cash on hand (balance incomplete)" });
    await page.getByTestId("loan-save").click();
    await expect(page.getByTestId("loan-saved")).toContainText("₱5,000 was added to Cash on hand");
    await expect(page.getByTestId("loan-saved")).toContainText("not counted as income");
    await page.getByRole("button", { name: "View loans" }).click();

    await expect(page.locator("h1")).toHaveText("Loans / Utang");
    await expect(page.getByTestId("loan-owed")).toHaveText("₱5,000");

    await page.getByTestId("tab-ledger").click();
    await expect(visible(page, "log-row-amount")).toHaveCount(1);
  });
});
