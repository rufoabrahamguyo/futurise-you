import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { addApplication, attachFromLibrary, fixture, markApplied, register, uploadLibraryDocument } from "./helpers";

test("journey 2: a new CV version never changes the file an old application submitted", async ({ page }) => {
  await register(page);
  await uploadLibraryDocument(page, "Platform CV", "cv", "cv-v1.pdf");
  const appId = await addApplication(page, "Platform Engineer", "Quartz Systems");
  await attachFromLibrary(page, appId, "Platform CV");
  await markApplied(page);

  // Upload version 2 of the same CV in the library.
  await page.goto("/documents");
  await page.getByRole("button", { name: /Platform CV/ }).click();
  const drawer = page.getByRole("dialog", { name: "Platform CV" });
  await drawer.locator('input[type="file"]').setInputFiles(fixture("cv-v2.pdf"));
  await drawer.getByRole("button", { name: "Upload as version 2" }).click();
  await expect(page.getByText("Uploaded version 2. Earlier versions are unchanged.")).toBeVisible();
  await expect(drawer.getByText("Submitted version")).toBeVisible();
  await page.keyboard.press("Escape");

  // The old application still opens exactly version 1.
  await page.goto(`/applications/${appId}?tab=documents`);
  const submitted = page.getByRole("region", { name: "Submitted with this application" });
  await expect(submitted.getByText(/Submitted version/)).toBeVisible();
  await expect(submitted.getByText(/cv-v1\.pdf · version 1/)).toBeVisible();
  await expect(submitted.getByText(/library now has version 2; this record keeps version 1/)).toBeVisible();
  await expect(submitted.getByRole("button", { name: /Remove/ })).toHaveCount(0);

  const downloadPromise = page.waitForEvent("download");
  await submitted.getByRole("button", { name: "Download" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("cv-v1.pdf");
  const bytes = await readFile((await download.path()) ?? "");
  expect(bytes.equals(await readFile(fixture("cv-v1.pdf")))).toBe(true);

  // The preview renders the PDF with PDF.js.
  await submitted.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByRole("img", { name: /cv-v1\.pdf, page 1 of 1/ })).toBeVisible();
});

test("journey 3: find an old application and see its full record", async ({ page }) => {
  await register(page);
  await uploadLibraryDocument(page, "General CV", "cv", "cv-v1.pdf");

  await page.goto("/applications/new");
  await page.getByRole("button", { name: /Upload the job description/ }).click();
  await page.getByLabel("Job title", { exact: true }).fill("Platform Engineer");
  await page.getByLabel("Company", { exact: true }).fill("Quartz Systems");
  await page.locator('input[type="file"]').setInputFiles(fixture("job-description.pdf"));
  await page.getByRole("button", { name: "Save application" }).click();
  await expect(page).toHaveURL(/\/applications\/[0-9a-f-]{36}\?tab=job-description/);
  await expect(page.getByRole("heading", { name: "Original job description" })).toBeVisible();
  const appId = page.url().split("/applications/")[1]?.split("?")[0] ?? "";

  await attachFromLibrary(page, appId, "General CV");
  await markApplied(page);

  await page.getByRole("tab", { name: "Overview" }).click();
  await page.getByRole("textbox", { name: "Notes" }).fill("Referred by Sam from the Leeds meetup.");
  await page.getByRole("tab", { name: "Timeline" }).click();
  await expect(page.getByText("Saves when you click away")).toHaveCount(0);
  await page.getByLabel("Summary").fill("Recruiter confirmed receipt");
  await page.getByRole("button", { name: "Add to timeline" }).click();
  await expect(page.getByText("Added to the timeline.")).toBeVisible();

  // Months later: start from the dashboard and search.
  await page.goto("/dashboard");
  await page.getByRole("combobox", { name: /Search applications/ }).fill("Quartz");
  await page.getByRole("option", { name: /Platform Engineer/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Platform Engineer" })).toBeVisible();

  await expect(page.getByRole("textbox", { name: "Notes" })).toHaveValue("Referred by Sam from the Leeds meetup.");
  await page.getByRole("tab", { name: "Job Description" }).click();
  await expect(page.getByLabel("Job description text")).toContainText("Experience operating Kubernetes in production");
  await expect(page.getByText("job-description.pdf")).toBeVisible();
  await page.getByRole("tab", { name: "Documents" }).click();
  await expect(page.getByRole("region", { name: "Submitted with this application" }).getByText("General CV")).toBeVisible();
  await page.getByRole("tab", { name: "Timeline" }).click();
  await expect(page.getByText("Recruiter confirmed receipt")).toBeVisible();
  await expect(page.getByText("Submitted with 1 file")).toBeVisible();
  await expect(page.getByText(/Status changed from Saved to Applied/)).toBeVisible();
});
