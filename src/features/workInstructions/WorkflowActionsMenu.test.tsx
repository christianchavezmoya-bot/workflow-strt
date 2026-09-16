import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WorkflowActionsMenu } from "./WorkflowActionsMenu";

function baseProps() {
  return {
    hasSteps: true,
    canRegenerate: true,
    onRegenerate: vi.fn(),
    canSync: true,
    onSync: vi.fn(),
    onExportContext: vi.fn(),
    canExportJson: true,
    onExportJson: vi.fn(),
    canImportJson: true,
    onImportJson: vi.fn(),
  };
}

async function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: "Workflow Actions" }));
  return screen.findByRole("menu");
}

describe("WorkflowActionsMenu — GOAL 5: single consolidated menu for all five workflow utilities", () => {
  it("exposes exactly the five workflow utilities behind one 'Workflow Actions' trigger", async () => {
    render(<WorkflowActionsMenu {...baseProps()} />);
    await openMenu();

    expect(screen.getByRole("menuitem", { name: /Regenerate Workflow/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Sync Feature Changes" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Export Workflow Context" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Export Workflow JSON" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Import Workflow JSON" })).toBeInTheDocument();
    expect(screen.getAllByRole("menuitem")).toHaveLength(5);
  });

  it("shows 'Generate Workflow' (not 'Regenerate') when there are no steps yet", async () => {
    render(<WorkflowActionsMenu {...baseProps()} hasSteps={false} />);
    await openMenu();

    expect(screen.getByRole("menuitem", { name: "Generate Workflow" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Regenerate Workflow/ })).not.toBeInTheDocument();
  });

  it("invokes the correct handler and closes the menu for each item", async () => {
    const props = baseProps();
    render(<WorkflowActionsMenu {...props} />);
    await openMenu();

    fireEvent.click(screen.getByRole("menuitem", { name: /Regenerate Workflow/ }));
    expect(props.onRegenerate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Sync Feature Changes" }));
    expect(props.onSync).toHaveBeenCalledTimes(1);

    await openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Export Workflow Context" }));
    expect(props.onExportContext).toHaveBeenCalledTimes(1);

    await openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Export Workflow JSON" }));
    expect(props.onExportJson).toHaveBeenCalledTimes(1);

    await openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Import Workflow JSON" }));
    expect(props.onImportJson).toHaveBeenCalledTimes(1);
  });

  it("disables Regenerate/Sync/Export JSON/Import JSON per their own flags, but Export Context stays always enabled", async () => {
    render(
      <WorkflowActionsMenu
        {...baseProps()}
        canRegenerate={false}
        canSync={false}
        canExportJson={false}
        canImportJson={false}
      />,
    );
    await openMenu();

    expect(screen.getByRole("menuitem", { name: /Regenerate Workflow/ })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("menuitem", { name: "Sync Feature Changes" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("menuitem", { name: "Export Workflow JSON" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("menuitem", { name: "Import Workflow JSON" })).toHaveAttribute("aria-disabled", "true");
    // Export Workflow Context has no configId/read-only gate — always clickable.
    expect(screen.getByRole("menuitem", { name: "Export Workflow Context" })).not.toHaveAttribute("aria-disabled", "true");
  });
});
