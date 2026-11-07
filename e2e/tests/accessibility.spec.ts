import AxeBuilder from "@axe-core/playwright";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

const DEMO_EMAIL = process.env.DEMO_USER_EMAIL ?? "demo@applyvault.dev";
const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD ?? "demo-password-2026";

const STATE = fileURLToPath(new URL("../.auth/demo.json", import.meta.url));

// Sign in once (sign-in is rate limited) and reuse the session cookie in every test.
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage({ storageState: undefined });
  await page.goto("/login");
  await page.getByLabel("Email").fill(DEMO_EMAIL);
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.context().storageState({ path: STATE });
  await page.close();
});

test.use({ storageState: STATE });

async function signInDemo(page: Page) {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function expectNoSeriousViolations(page: Page, name: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${name}: ${v.id} — ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`)).toEqual([]);
}

const PAGES: [string, string, string][] = [
  ["dashboard", "/dashboard", "Recently updated"],
  ["board", "/applications?view=board", "Saved"],
  ["table", "/applications?view=table", "Last updated"],
  ["calendar", "/applications?view=calendar", "Deadline"],
  ["library", "/documents", "Document Library"],
  ["reminders", "/reminders", "Calendar & Reminders"],
  ["analytics", "/analytics", "Record completeness"],
  ["settings", "/settings", "Export your data"],
];

for (const width of [1280, 375]) {
  test(`main screens have no serious accessibility violations at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await signInDemo(page);
    for (const [name, path, marker] of PAGES) {
      await page.goto(path);
      await expect(page.getByText(marker).first()).toBeAttached();
      await expectNoSeriousViolations(page, `${name}@${width}`);
      // Nothing overflows the viewport horizontally (tables and boards scroll inside their own containers).
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${name} overflows at ${width}px`).toBeLessThanOrEqual(1);
    }
    await page.goto("/applications?view=table&q=northwind");
    await page.getByRole("link", { name: "Senior Product Designer" }).click();
    for (const tab of ["Overview", "Job Description", "Documents", "Questions & Answers", "Timeline", "Reminders", "Interview Prep"]) {
      await page.getByRole("tab", { name: tab }).click();
      await page.waitForLoadState("networkidle");
      await expectNoSeriousViolations(page, `detail/${tab}@${width}`);
    }
  });
}

test("the board and status changes work with the keyboard alone", async ({ page }) => {
  await signInDemo(page);
  await page.goto("/applications?view=board");
  // Each card has a native, labelled status menu that takes keyboard focus.
  const select = page.getByLabel("Move for UX Researcher");
  await select.focus();
  await expect(select).toBeFocused();
  await select.selectOption("preparing");
  await expect(page.getByRole("region", { name: /^Preparing/ }).getByRole("link", { name: "UX Researcher" })).toBeVisible();
  await page.getByLabel("Move for UX Researcher").selectOption("saved");
  await expect(page.getByRole("region", { name: /^Saved/ }).getByRole("link", { name: "UX Researcher" })).toBeVisible();

  // Skip link and tab order reach the main content.
  await page.goto("/dashboard");
  await expect(page.getByText("Recently updated")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
});
