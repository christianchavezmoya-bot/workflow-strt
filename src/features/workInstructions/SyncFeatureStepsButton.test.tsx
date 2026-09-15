import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SyncFeatureStepsButton } from "./SyncFeatureStepsButton";

describe("SyncFeatureStepsButton", () => {
  it("appears (labeled distinctly, not 'Regenerate Workflow') when visible", () => {
    render(<SyncFeatureStepsButton visible onClick={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Sync Feature Steps" })).toBeInTheDocument();
    expect(screen.queryByText(/Regenerate Workflow/i)).not.toBeInTheDocument();
  });

  it("does not render at all when not visible (e.g. read-only or no saved config)", () => {
    render(<SyncFeatureStepsButton visible={false} onClick={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Sync Feature Steps" })).not.toBeInTheDocument();
  });

  it("calls onClick, and only onClick, when clicked", () => {
    const onClick = vi.fn();
    render(<SyncFeatureStepsButton visible onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: "Sync Feature Steps" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
