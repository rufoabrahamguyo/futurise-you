import { expect, test } from "@playwright/test";

import { addApplication, register } from "./helpers";

test("register, add an application, move it on the board and find it again", async ({ page }) => {
  await register(page);
  await expect(page.getByText("Your vault is empty")).toBeVisible();

  await addApplication(page, "Platform Engineer", "Quartz Systems");

  await page.goto("/applications?view=board");
  const saved = page.getByRole("region", { name: /^Saved, 1 applications/ });
  await expect(saved.getByRole("link", { name: "Platform Engineer" })).toBeVisible();

  // Keyboard-accessible status control.
  await page.getByLabel("Move for Platform Engineer").selectOption("preparing");
  await expect(page.getByRole("region", { name: /^Preparing, 1 applications/ }).getByRole("link", { name: "Platform Engineer" })).toBeVisible();

  // The view persists in the URL.
  await page.getByRole("button", { name: "Table" }).click();
  await expect(page).toHaveURL(/view=table/);
  await page.reload();
  await expect(page.getByRole("table")).toBeVisible();

  // Global search.
  await page.getByRole("combobox", { name: /Search applications/ }).fill("quartz");
  await page.getByRole("option", { name: /Platform Engineer/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Platform Engineer" })).toBeVisible();
});
