import { expect, type Page, test } from "@playwright/test";

async function enterApp(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("landing-open")).toBeVisible();
  const local = page.getByTestId("landing-local");
  if (await local.isVisible()) await local.click();
  else await page.getByTestId("landing-open").click();
  await expect(page.getByTestId("first-use")).toBeVisible();
}

function thisMonthTitle(): string {
  return new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

test.describe("Budget", () => {
  test("empty month -> set monthly budget -> expense updates Spent and Left", async ({ page }) => {
    await enterApp(page);
    await page.getByTestId("tab-budget").click();

    const empty = page.getByTestId("budget-empty");
    await expect(
      empty.getByRole("heading", { name: `Set your budget for ${thisMonthTitle()}` }),
    ).toBeVisible();
    // No earlier budget: nothing to copy, and no zero-value summary cards.
    await expect(page.getByTestId("budget-copy")).toHaveCount(0);
    await expect(page.getByTestId("budget-spent")).toHaveCount(0);
    await expect(page.getByText(/\b(lines|periods|particulars)\b/i)).toHaveCount(0);

    await page.getByTestId("budget-set").click();
    const form = page.getByTestId("budget-form");
    // Category and limit are required; errors are announced inline.
    await page.getByTestId("budget-form-save").click();
    await expect(form.getByText("Choose a category.")).toBeVisible();

    await page.getByLabel("Category").selectOption({ label: "Transport" });
    await page.getByLabel("Spending limit").fill("1000");
    await page.getByTestId("budget-form-save").click();

    await expect(page.getByTestId("budget-active")).toBeVisible();
    await expect(page.getByTestId("budget-total")).toHaveText("₱1,000");
    await expect(page.getByTestId("budget-spent")).toHaveText("₱0");
    await expect(page.getByTestId("budget-left")).toHaveText("₱1,000");

    // Record an expense in Activity; the budget picks it up without retyping.
    await page.getByTestId("tab-ledger").click();
    await page.getByTestId("log-add-expense").click();
    await page.getByTestId("log-amount").fill("120");
    await page.getByRole("button", { name: "Transport" }).click();
    await page.getByTestId("log-save").click();
    await page.getByTestId("log-done").click();

    await page.getByTestId("tab-budget").click();
    await expect(page.getByTestId("budget-spent")).toHaveText("₱120");
    await expect(page.getByTestId("budget-left")).toHaveText("₱880");
    await expect(page.getByTestId("budget-category-left")).toHaveText("₱880 left");

    // Next month offers to copy this one; copying brings targets only.
    await page.getByTestId("budget-next-month").click();
    await page.getByTestId("budget-copy").click();
    await expect(page.getByTestId("budget-total")).toHaveText("₱1,000");
    await expect(page.getByTestId("budget-spent")).toHaveText("₱0");
  });

  test("works at 320px without sideways scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await enterApp(page);
    await page.getByTestId("tab-budget").click();
    await page.getByTestId("budget-set").click();
    await page.getByLabel("Category").selectOption({ label: "Food / groceries" });
    await page.getByLabel("Spending limit").fill("5000");
    await page.getByTestId("budget-form-save").click();
    await expect(page.getByTestId("budget-left")).toHaveText("₱5,000");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("Budget with earlier manual entries", () => {
  test("shows typed amounts separately and lets the person review them", async ({ page }) => {
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const books = {
      version: 5,
      settings: { monthlyIncome: 0, emergencyReserve: 0, paydayDays: [], setupComplete: true, openedOn: `${key}-01` },
      accounts: [
        { id: "cash-on-hand", name: "Cash", kind: "cash", openingBalance: 5000, monthlyRate: 0, dueDay: 0, plannedPayment: 0, goal: 0, archived: false },
      ],
      categories: [{ id: "cat-electric", name: "Electricity", planned: 0, dueDay: 0, kind: "expense", tone: "utility" }],
      particulars: [],
      budgetPeriods: [{ id: "old", start: `${key}-01`, end: `${key}-${last}` }],
      budgetLines: [
        { id: "elec", periodId: "old", due: `${key}-10`, particular: "ELECTRIC", particularId: null, income: 0, expense: 2000, actual: 1800, status: "unpaid", order: 0 },
      ],
      transactions: [],
    };
    await page.addInitScript((value) => {
      if (!window.sessionStorage.getItem("seeded")) {
        window.localStorage.setItem("ahon.v6", value);
        window.sessionStorage.setItem("seeded", "1");
      }
    }, JSON.stringify(books));
    await page.goto("/");
    const local = page.getByTestId("landing-local");
    await expect(page.getByTestId("landing-open")).toBeVisible();
    if (await local.isVisible()) await local.click();
    else await page.getByTestId("landing-open").click();
    await page.getByTestId("tab-budget").click();

    await expect(page.getByTestId("budget-total")).toHaveText("₱2,000");
    // The typed ₱1,800 is never counted as spending.
    await expect(page.getByTestId("budget-spent")).toHaveText("₱0");
    const legacy = page.getByTestId("budget-legacy");
    await expect(
      legacy.getByRole("heading", { name: "Earlier manual entries (not from your activity)" }),
    ).toBeVisible();
    await expect(legacy).toContainText("Typed ₱1,800");

    await legacy.getByRole("button", { name: "Keep as note" }).click();
    await expect(legacy).toContainText("Kept as a note.");
    await legacy.getByRole("button", { name: "Hide" }).click();
    await expect(legacy.getByRole("button", { name: "Show hidden entries (1)" })).toBeVisible();
    await expect(legacy).not.toContainText("Typed ₱1,800");
  });
});
