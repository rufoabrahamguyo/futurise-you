import { expect, type Page } from "@playwright/test";

export const PASSWORD = "e2e-passphrase-2026";

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.applyvault.test`;
}

export async function register(page: Page, name = "Riley Tester"): Promise<string> {
  const email = uniqueEmail("journey");
  await page.goto("/register");
  await page.getByLabel(/Full name/).fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return email;
}

export async function addApplication(page: Page, title: string, company: string): Promise<string> {
  await page.goto("/applications/new");
  const manual = page.getByRole("button", { name: /Enter details manually/ });
  if (await manual.isVisible()) await manual.click();
  await page.getByLabel("Job title", { exact: true }).fill(title);
  await page.getByLabel("Company", { exact: true }).fill(company);
  await page.getByRole("button", { name: "Save application" }).click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  return page.url().split("/applications/")[1]?.split("?")[0] ?? "";
}
