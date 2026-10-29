import { expect, type Page, test } from "@playwright/test";

async function enterApp(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("landing-open")).toBeVisible();
  const local = page.getByTestId("landing-local");
  if (await local.isVisible()) await local.click();
  else await page.getByTestId("landing-open").click();
  await expect(page.getByTestId("first-use")).toBeVisible();
}

async function addExpense(page: Page, amount: string) {
  await page.getByTestId("tab-ledger").click();
  await page.getByTestId("log-add-expense").click();
  await page.getByTestId("log-amount").fill(amount);
  await page.getByRole("button", { name: "Food", exact: true }).click();
  await page.getByTestId("log-save").click();
  await page.getByTestId("log-done").click();
}

async function addLoan(page: Page, name: string, amount: string) {
  await page.getByTestId("tab-utang").click();
  await page.getByTestId("loans-add").click();
  await page.getByTestId("loan-kind-existing").check();
  await page.getByTestId("loan-name").fill(name);
  await page.getByTestId("loan-amount").fill(amount);
  await page.getByTestId("loan-save").click();
  await page.getByTestId("loan-done").click();
}

test.describe("Desktop layout", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("sidebar lists every page and quick actions, and navigates", async ({ page }) => {
    await enterApp(page);
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav).toBeVisible();
    const box = await nav.boundingBox();
    expect(box?.x).toBe(0);
    expect(box?.height).toBeGreaterThan(800);

    await expect(page.getByTestId("tab-more")).toBeHidden();
    await expect(page.getByTestId("tab-add")).toBeHidden();
    await expect(page.getByTestId("quick-add-expense")).toBeVisible();

    await nav.getByRole("button", { name: "Activity", exact: true }).click();
    await expect(page.locator("h1")).toHaveText("Activity");
    await nav.getByRole("button", { name: "Savings", exact: true }).click();
    await expect(page.locator("h1")).toHaveText("Savings");
    await nav.getByRole("button", { name: "Cash & wallets" }).click();
    await expect(page.locator("h1")).toHaveText("Cash & wallets");
    await expect(nav.getByRole("button", { name: "Cash & wallets" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    // Quick actions open forms over the current page.
    await page.getByTestId("quick-add-expense").click();
    await expect(page.getByRole("heading", { name: "Add expense" })).toBeVisible();
    await expect(page.locator("h1")).toHaveText("Cash & wallets");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Add expense" })).toHaveCount(0);
  });

  test("a loan opens in a side panel; Escape closes it and returns focus", async ({ page }) => {
    await enterApp(page);
    await addLoan(page, "SSS loan", "12000");

    const details = page.getByRole("button", { name: "Details for SSS loan" });
    await details.click();
    const panel = page.getByRole("dialog", { name: "SSS loan" });
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId("loan-panel-owed")).toHaveText("₱12,000");
    // Docked to the right edge on wide screens (after it slides in).
    await expect
      .poll(async () => {
        const box = await panel.boundingBox();
        return Math.round((box?.x ?? 0) + (box?.width ?? 0));
      })
      .toBe(1440);

    // A form opened from the panel closes first on Escape; the panel stays.
    await panel.getByTestId("loan-panel-record-payment").click();
    await expect(page.getByRole("dialog", { name: "Record payment" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Record payment" })).toHaveCount(0);
    await expect(panel).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(details).toBeFocused();
  });

  test("a transaction opens in a side panel with edit and remove", async ({ page }) => {
    await enterApp(page);
    await addExpense(page, "250");

    await page.getByTestId("log-row").click();
    const panel = page.getByTestId("log-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("role", "dialog");
    await expect(panel.getByTestId("log-panel-amount")).toContainText("₱250");
    await expect(panel.getByTestId("log-edit")).toBeVisible();
    await expect(panel.getByTestId("log-remove")).toBeVisible();

    // Tab stays inside the open panel.
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press("Tab");
      expect(await panel.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);

    await page.getByTestId("log-row").click();
    await page.getByTestId("panel-close").click();
    await expect(page.getByTestId("log-panel")).toHaveCount(0);
  });
});

test.describe("Phone layout", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("bottom tabs with labels, add menu, and no sideways scroll", async ({ page }) => {
    await enterApp(page);
    const nav = page.getByRole("navigation", { name: "Main" });
    const box = await nav.boundingBox();
    expect(Math.round((box?.y ?? 0) + (box?.height ?? 0))).toBe(844);
    for (const label of ["Home", "Activity", "Budget", "Loans", "More"]) {
      const tab = nav.getByRole("button", { name: label, exact: true });
      await expect(tab).toBeVisible();
      const tabBox = await tab.boundingBox();
      expect(tabBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    await expect(page.getByTestId("quick-add-expense")).toBeHidden();

    await page.getByTestId("tab-add").click();
    const menu = page.getByRole("dialog", { name: "Add" });
    await expect(menu).toBeVisible();
    await menu.getByTestId("add-menu-expense").click();
    await expect(page.getByRole("heading", { name: "Add expense" })).toBeVisible();
    await page.keyboard.press("Escape");

    for (const id of ["tab-home", "tab-ledger", "tab-budget", "tab-utang"]) {
      await page.getByTestId(id).click();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    }
  });

  test("details open as a bottom sheet", async ({ page }) => {
    await enterApp(page);
    await addLoan(page, "Utang kay Ate", "3000");
    await page.getByRole("button", { name: "Details for Utang kay Ate" }).click();
    const panel = page.getByRole("dialog", { name: "Utang kay Ate" });
    await expect(panel).toBeVisible();
    await expect
      .poll(async () => {
        const box = await panel.boundingBox();
        return Math.round((box?.y ?? 0) + (box?.height ?? 0));
      })
      .toBe(844);
    await page.getByTestId("panel-close").click();
    await expect(panel).toHaveCount(0);
  });
});
