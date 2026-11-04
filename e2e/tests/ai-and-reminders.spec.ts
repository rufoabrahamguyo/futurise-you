import { expect, test } from "@playwright/test";

import { fixture, markApplied, register, uploadLibraryDocument, waitForEmail } from "./helpers";

test("journey 1 + 4: upload a job description, review the extraction, attach documents, apply, then prepare for the interview", async ({ page }) => {
  await register(page);
  await uploadLibraryDocument(page, "Platform CV", "cv", "cv-v1.pdf");

  // Add an application from an uploaded job description.
  await page.goto("/applications/new");
  await page.getByRole("button", { name: /Upload the job description/ }).click();
  await page.getByLabel("Job title", { exact: true }).fill("Engineer");
  await page.getByLabel("Company", { exact: true }).fill("Quartz");
  await page.locator('input[type="file"]').setInputFiles(fixture("job-description.pdf"));
  await page.getByRole("button", { name: "Save application" }).click();
  await expect(page).toHaveURL(/\?tab=job-description/);

  // AI extraction with the one-time notice.
  await page.getByRole("button", { name: "Extract details with AI" }).click();
  await page.getByRole("dialog", { name: "Before you use AI" }).getByRole("button", { name: "I understand, continue" }).click();
  await expect(page.getByRole("button", { name: "Review extracted details" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("AI-extracted. Review and correct anything before relying on it.")).toBeVisible();

  // Side-by-side review.
  await page.getByRole("button", { name: "Review extracted details" }).click();
  const review = page.getByRole("dialog", { name: "Review extracted details" });
  await expect(review.getByLabel("Original job description")).toContainText("Kubernetes");
  await expect(review.getByLabel("Job title")).toHaveValue("Platform Engineer");
  await expect(review.getByLabel("Company")).toHaveValue("Quartz Systems");
  await expect(review.getByLabel("Location")).toHaveValue("Leeds, UK");
  await expect(review.getByLabel("Compensation")).toHaveAttribute("placeholder", "Not specified");
  await expect(review.getByLabel("Compensation")).toHaveValue("");
  await expect(review.getByLabel("Date")).toHaveValue("2026-06-30");
  await review.getByRole("button", { name: "Approve and update application" }).click();
  await expect(page.getByText("Review approved. Your application details are updated.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Platform Engineer" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your reviewed version" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Mandatory requirements" })).toContainText("Experience operating Kubernetes in production");
  await expect(page.getByText("Not specified").first()).toBeVisible();

  // Attach a CV from the library and upload a cover letter directly.
  await page.getByRole("tab", { name: "Documents" }).click();
  await page.getByRole("button", { name: "Attach from library" }).click();
  const attach = page.getByRole("dialog", { name: "Attach from library" });
  await attach.getByLabel("Document").selectOption({ label: "Platform CV" });
  await attach.getByRole("button", { name: "Attach" }).click();
  await page.getByRole("button", { name: "Upload a file" }).click();
  const upload = page.getByRole("dialog", { name: "Upload a file to this application" });
  await upload.getByLabel("Role").selectOption("cover_letter");
  await upload.locator('input[type="file"]').setInputFiles(fixture("cover-letter.docx"));
  await upload.getByRole("button", { name: "Upload and attach" }).click();
  await expect(page.getByText("File uploaded and attached.")).toBeVisible();

  await markApplied(page);
  const submitted = page.getByRole("region", { name: "Submitted with this application" });
  await expect(submitted.getByText("Platform CV")).toBeVisible();
  await expect(submitted.getByText(/cover-letter\.docx · version 1/)).toBeVisible();
  await expect(submitted.getByText(/Submitted version/)).toHaveCount(2);

  // Journey 4: move to Interview, generate preparation, save notes.
  await page.getByLabel(/^Status for/).selectOption("interview");
  await expect(page.getByText(/Moved “Platform Engineer” to Interview/)).toBeVisible();
  await page.getByRole("tab", { name: "Interview Prep" }).click();
  await page.getByRole("button", { name: "Prepare with AI" }).click();
  await expect(page.getByText("AI-generated practice questions. These are not actual questions from the employer.")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("region", { name: "Technical questions" })).toContainText("Kubernetes");
  await expect(page.getByRole("region", { name: "Questions about your CV" })).toBeVisible();
  await page.getByRole("textbox", { name: "My notes" }).fill("Lead with the CI pipeline story.");
  await page.getByRole("button", { name: "Save notes" }).click();
  await expect(page.getByText("Notes saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "My notes" })).toHaveValue("Lead with the CI pipeline story.");
});

test("journey 5: set a follow-up, receive it in-app and by email, then record what happened", async ({ page }) => {
  test.setTimeout(240_000);
  const email = await register(page);

  // Verify the address through the email in Mailpit, so reminder emails are allowed.
  const verification = await waitForEmail(page, email, /Confirm your ApplyVault email/);
  const link = /https?:\/\/\S+verify-email\S+/.exec(verification)?.[0] ?? "";
  await page.goto(link);
  await expect(page.getByText("Email confirmed")).toBeVisible();

  await page.goto("/applications/new");
  await page.getByRole("button", { name: /Enter details manually/ }).click();
  await page.getByLabel("Job title", { exact: true }).fill("Site Reliability Engineer");
  await page.getByLabel("Company", { exact: true }).fill("Northwind");
  await page.getByRole("button", { name: "Save application" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Site Reliability Engineer" })).toBeVisible();

  // A custom follow-up one minute from now (in the user's time zone).
  await page.getByRole("tab", { name: "Reminders" }).click();
  await page.getByRole("button", { name: "Custom…" }).click();
  const form = page.getByRole("dialog", { name: "New reminder" });
  const soon = await page.evaluate(() => {
    const d = new Date(Date.now() + 60_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
  });
  await form.getByLabel("Date").fill(soon.date);
  await form.getByLabel("Time").fill(soon.time);
  await form.getByRole("button", { name: "Set reminder" }).click();
  await expect(page.getByText("Reminder set.")).toBeVisible();

  // Beat dispatches due reminders every minute.
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole("button", { name: /Notifications, 1 unread/ })).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 180_000, intervals: [5_000] });
  const reminderEmail = await waitForEmail(page, email, /Reminder: Follow up with Northwind/, 60_000);
  expect(reminderEmail).toContain("Site Reliability Engineer at Northwind");

  await page.getByRole("button", { name: /Notifications, 1 unread/ }).click();
  await page.getByRole("button", { name: /Follow up with Northwind/ }).click();
  await expect(page).toHaveURL(/tab=reminders/);
  await page.getByRole("button", { name: "Complete" }).click();
  const record = page.getByRole("dialog", { name: "Record the follow-up" });
  await record.getByLabel(/What happened/).fill("Emailed the hiring manager; decision expected Friday.");
  await record.getByRole("button", { name: "Add to timeline" }).click();
  await expect(page.getByText("Follow-up recorded on the timeline.")).toBeVisible();

  await page.getByRole("tab", { name: "Timeline" }).click();
  await expect(page.getByText("Emailed the hiring manager; decision expected Friday.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Notifications" })).toBeVisible();
});
