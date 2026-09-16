import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AdvancedWorkflowActionsMenu } from "./AdvancedWorkflowActionsMenu";

describe("AdvancedWorkflowActionsMenu — UX correction 2: legacy raw JSON tucked behind a clearly labeled Advanced menu", () => {
  it("is not visible as a normal 'Export JSON'/'Import JSON' button — only a clearly labeled 'Advanced' trigger", () => {
    render(<AdvancedWorkflowActionsMenu onExportRawJson={vi.fn()} onImportRawJson={vi.fn()} />);

    expect(screen.getByRole("button", { name: /Advanced/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Export JSON" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Import JSON" })).not.toBeInTheDocument();
  });

  it("labels both legacy actions clearly as legacy, and explains why, once opened", async () => {
    render(<AdvancedWorkflowActionsMenu onExportRawJson={vi.fn()} onImportRawJson={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Advanced/ }));

    expect(await screen.findByRole("menuitem", { name: "Export Raw JSON (legacy)" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Import Raw JSON (legacy)" })).toBeInTheDocument();
    expect(screen.getByText(/no product\/feature validation/i)).toBeInTheDocument();
  });

  it("invokes the correct handler and closes the menu for each legacy action", async () => {
    const onExportRawJson = vi.fn();
    const onImportRawJson = vi.fn();
    render(<AdvancedWorkflowActionsMenu onExportRawJson={onExportRawJson} onImportRawJson={onImportRawJson} />);

    fireEvent.click(screen.getByRole("button", { name: /Advanced/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Export Raw JSON (legacy)" }));
    expect(onExportRawJson).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Advanced/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Import Raw JSON (legacy)" }));
    expect(onImportRawJson).toHaveBeenCalledTimes(1);
  });
});
