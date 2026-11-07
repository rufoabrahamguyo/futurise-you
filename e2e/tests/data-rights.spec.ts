import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { addApplication, PASSWORD, register } from "./helpers";

test("export my data as a ZIP, then delete my account", async ({ page }) => {
  const email = await register(page);
  await addApplication(page, "Data Analyst", "Harbor & Co");

  await page.goto("/settings");
  await page.getByRole("button", { name: "Request export" }).click();
  const download = page.getByRole("button", { name: "Download" });
  await expect(download).toBeVisible({ timeout: 60_000 });
  const pending = page.waitForEvent("download");
  await download.click();
  const file = await pending;
  expect(file.suggestedFilename()).toMatch(/^kazitrail-export-\d{4}-\d{2}-\d{2}\.zip$/);
  const bytes = await readFile((await file.path()) ?? "");
  expect(bytes.subarray(0, 2).toString()).toBe("PK");
  for (const name of ["applications.json", "applications.csv", "profile.json"]) {
    expect(bytes.includes(Buffer.from(name))).toBe(true);
  }

  await page.getByRole("button", { name: "Delete my account" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete your account permanently?" });
  await dialog.getByLabel("Type DELETE to confirm").fill("DELETE");
  await dialog.getByLabel("Your password").fill(PASSWORD);
  await dialog.getByRole("button", { name: "Delete everything" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
});
