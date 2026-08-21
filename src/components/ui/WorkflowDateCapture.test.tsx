import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@mui/x-date-pickers", () => ({
  DatePicker: () => null,
  LocalizationProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@mui/x-date-pickers/AdapterDayjs", () => ({
  AdapterDayjs: class AdapterDayjs {},
}));
vi.mock("../../utils/platform", () => ({
  isMobileNativePlatform: vi.fn(() => true),
}));

import WorkflowDateCapture from "./WorkflowDateCapture";

describe("WorkflowDateCapture on native", () => {
  it("renders a native date input for date-only fields", () => {
    render(
      <WorkflowDateCapture
        value=""
        onChange={() => {}}
        label="Inspection date"
        fieldKey="inspectionDate"
      />,
    );

    const input = screen.getByLabelText("Inspection date");
    expect(input).toHaveAttribute("type", "date");
  });

  it("emits YYYY-MM-DD when the native date input changes", () => {
    const onChange = vi.fn();
    render(
      <WorkflowDateCapture
        value=""
        onChange={onChange}
        label="Inspection date"
      />,
    );

    fireEvent.change(screen.getByLabelText("Inspection date"), {
      target: { value: "2026-08-21" },
    });
    expect(onChange).toHaveBeenCalledWith("2026-08-21");
  });
});
