import { fileURLToPath } from "node:url";

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
  await page.getByRole("button", { name: /Enter details manually/ }).click();
  await page.getByLabel("Job title", { exact: true }).fill(title);
  await page.getByLabel("Company", { exact: true }).fill(company);
  await page.getByRole("button", { name: "Save application" }).click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  return page.url().split("/applications/")[1]?.split("?")[0] ?? "";
}

export const fixture = (name: string) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

/** Uploads a master document to the library from the Document Library page. */
export async function uploadLibraryDocument(page: Page, title: string, type: string, file: string): Promise<void> {
  await page.goto("/documents");
  await page.getByRole("button", { name: "Upload document" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Upload a document" });
  await dialog.getByLabel("Type").selectOption(type);
  await dialog.locator('input[type="file"]').setInputFiles(fixture(file));
  await dialog.getByLabel("Name").fill(title);
  await dialog.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByText(`Uploaded “${title}” as version 1.`)).toBeVisible();
  await page.keyboard.press("Escape");
}

/** Attaches the latest version of a library document from the application's Documents tab. */
export async function attachFromLibrary(page: Page, applicationId: string, title: string): Promise<void> {
  await page.goto(`/applications/${applicationId}?tab=documents`);
  await page.getByRole("button", { name: "Attach from library" }).click();
  const dialog = page.getByRole("dialog", { name: "Attach from library" });
  await dialog.getByLabel("Document").selectOption({ label: title });
  await expect(dialog.getByLabel("Version")).toBeVisible();
  await dialog.getByRole("button", { name: "Attach" }).click();
  await expect(dialog).toBeHidden();
}

export async function markApplied(page: Page): Promise<void> {
  await page.getByLabel(/^Status for/).selectOption("applied");
  const confirm = page.getByRole("dialog", { name: "Mark as applied?" });
  await confirm.getByRole("button", { name: /Mark as applied|Continue without a CV/ }).click();
  await expect(page.getByText(/files are locked as sent/)).toBeVisible();
}
