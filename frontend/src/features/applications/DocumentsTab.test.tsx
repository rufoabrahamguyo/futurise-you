import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { ApplicationDocumentLink } from "@/lib/types";
import { fakeApi, renderPage } from "@/test/utils";

import { DocumentsTab } from "./DocumentsTab";
import { makeApp, page } from "./fixtures";

function link(overrides: Partial<ApplicationDocumentLink> = {}): ApplicationDocumentLink {
  return {
    id: "l1",
    role: "cv",
    is_frozen: false,
    frozen_at: null,
    added_after_submission: false,
    created_at: "2026-03-01T10:00:00Z",
    document_id: "d1",
    document_title: "Product Designer CV",
    document_archived: false,
    latest_version_number: 1,
    version: {
      id: "v1",
      version_number: 1,
      original_filename: "cv.pdf",
      mime_type: "application/pdf",
      size: 2048,
      sha256: "x",
      created_at: "2026-03-01T10:00:00Z",
      previewable: true,
    },
    ...overrides,
  };
}

describe("documents tab", () => {
  it("shows submitted files as locked with their exact version, and later files as added after submission", async () => {
    fakeApi().on("GET", "/applications/a1/documents", [
      link({ is_frozen: true, frozen_at: "2026-03-05T09:00:00Z", latest_version_number: 3 }),
      link({
        id: "l2",
        role: "portfolio",
        document_title: "Portfolio",
        added_after_submission: true,
      }),
    ]);
    renderPage(
      <DocumentsTab
        app={makeApp({
          status: "applied",
          submitted_at: "2026-03-05T09:00:00Z",
          date_applied: "2026-03-05",
        })}
      />,
    );

    const submitted = await screen.findByRole("region", {
      name: "Submitted with this application",
    });
    expect(within(submitted).getByText(/Submitted version/)).toBeInTheDocument();
    expect(within(submitted).getByText(/cv.pdf · version 1/)).toBeInTheDocument();
    expect(
      within(submitted).getByText(/library now has version 3; this record keeps version 1/),
    ).toBeInTheDocument();
    expect(within(submitted).queryByRole("button", { name: /Remove/ })).not.toBeInTheDocument();

    const after = screen.getByRole("region", { name: "Added after submission" });
    expect(
      within(after).getByText("Added after submission", { selector: "span" }),
    ).toBeInTheDocument();
    expect(within(after).getByRole("button", { name: "Remove Portfolio" })).toBeInTheDocument();
  });

  it("attaches the chosen library version before submission", async () => {
    const api = fakeApi()
      .on("GET", "/applications/a1/documents", [])
      .on(
        "GET",
        "/documents",
        page([
          {
            id: "d1",
            title: "Product Designer CV",
            type: "cv",
            is_master: true,
            archived_at: null,
            created_at: "",
            updated_at: "",
            latest_version: null,
            version_count: 2,
            application_count: 0,
          },
        ]),
      )
      .on("GET", "/documents/d1", {
        id: "d1",
        title: "Product Designer CV",
        type: "cv",
        versions: [
          link({ version: { ...link().version, id: "v2", version_number: 2 } }).version,
          link().version,
        ],
        usages: [],
      })
      .on("POST", "/applications/a1/documents", { status: 201, body: link() });
    renderPage(<DocumentsTab app={makeApp()} />);
    const user = userEvent.setup();
    expect(await screen.findByText("No documents attached yet")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Attach from library" }));
    const dialog = await screen.findByRole("dialog", { name: "Attach from library" });
    await user.selectOptions(within(dialog).getByLabelText("Document"), "d1");
    await user.selectOptions(await within(dialog).findByLabelText("Version"), "v1");
    await user.click(within(dialog).getByRole("button", { name: "Attach" }));
    await screen.findByText("Attached.");
    expect(
      api.calls.find((c) => c.method === "POST" && c.path === "/applications/a1/documents")?.body,
    ).toEqual({ document_version_id: "v1", role: "cv" });
  });

  it("warns when no CV is attached before submission", async () => {
    fakeApi().on("GET", "/applications/a1/documents", [
      link({ role: "cover_letter", document_title: "Letter" }),
    ]);
    renderPage(<DocumentsTab app={makeApp()} />);
    expect(await screen.findByText("No CV attached")).toBeInTheDocument();
  });
});
