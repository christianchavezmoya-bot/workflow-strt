import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { PublicRunSummary } from "../../types/signature";

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useParams: () => ({ tokenId: "test-token-id" }) };
});

const mockGet = vi.fn();
const mockPost = vi.fn();
vi.mock("../../services/api", () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

vi.mock("../../utils/generateWorkflowReport", () => ({
  generateWorkflowReport: vi.fn(() => Promise.reject(new Error("not needed for these tests"))),
}));
vi.mock("../../utils/buildPublicSignReportContext", () => ({
  buildPublicSignReportContext: vi.fn(() => Promise.resolve({})),
}));
vi.mock("../../components/reports/PdfBlobPreview", () => ({
  default: () => null,
}));

import ExternalSignPage from "./ExternalSignPage";

const summary: PublicRunSummary = {
  runId: "run-1",
  assetName: "Asset 1",
  assetSerial: "SN-1",
  workflowName: "Installation",
  projectJobNumber: "mel01",
  customerName: "Test Customer",
  completedByName: "Test Installer",
  completedAt: "2026-08-31T00:00:00Z",
  signatureStatus: "PendingCustomer",
  signerRole: "Customer",
  recipientName: "Test Customer",
  recipientEmail: "customer@example.com",
  tokenValid: true,
  workflowSnapshotJson: "{}",
  stepResultsJson: "{}",
  issuesJson: "[]",
};

async function renderAtSignStage() {
  mockGet.mockResolvedValue({ data: summary });
  render(<ExternalSignPage />);

  const proceedButton = await screen.findByRole("button", { name: /proceed to sign/i });
  fireEvent.click(proceedButton);

  const nameField = await screen.findByLabelText(/your full name/i);
  fireEvent.change(nameField, { target: { value: "Jane Signer" } });
  fireEvent.click(screen.getByRole("checkbox"));
}

describe("ExternalSignPage — OTP UI states", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
  });

  it("renders 'Require OTP verification' as a real button", async () => {
    await renderAtSignStage();

    const otpButton = screen.getByRole("button", { name: /require otp verification/i });
    expect(otpButton.tagName).toBe("BUTTON");
  });

  it("shows the confirmation message and updated field label after requesting OTP", async () => {
    await renderAtSignStage();
    mockPost.mockResolvedValueOnce({ data: { message: "OTP sent" } });

    fireEvent.click(screen.getByRole("button", { name: /require otp verification/i }));

    expect(await screen.findByText(/verification code sent to your email/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Verification code (6 digits)")).toBeInTheDocument();
    expect(mockPost).toHaveBeenCalledWith(
      expect.stringContaining("/public/sign/test-token-id/request-otp"),
    );
  });

  it("shows a field-level error with the backend message when OTP is missing", async () => {
    await renderAtSignStage();
    mockPost.mockResolvedValueOnce({ data: { message: "OTP sent" } });
    fireEvent.click(screen.getByRole("button", { name: /require otp verification/i }));
    await screen.findByLabelText("Verification code (6 digits)");

    mockPost.mockRejectedValueOnce({
      response: { status: 400, data: { message: "OTP code is required for this link." } },
    });
    fireEvent.click(screen.getByRole("button", { name: /submit signature/i }));

    const otpInput = await screen.findByLabelText("Verification code (6 digits)");
    expect(otpInput).toHaveAttribute("aria-invalid", "true");
    expect(screen.getAllByText("OTP code is required for this link.").length).toBeGreaterThan(0);
  });

  it("clears the field-level error state when the OTP is edited", async () => {
    await renderAtSignStage();
    mockPost.mockResolvedValueOnce({ data: { message: "OTP sent" } });
    fireEvent.click(screen.getByRole("button", { name: /require otp verification/i }));
    await screen.findByLabelText("Verification code (6 digits)");

    mockPost.mockRejectedValueOnce({
      response: { status: 400, data: { message: "OTP code is required for this link." } },
    });
    fireEvent.click(screen.getByRole("button", { name: /submit signature/i }));
    const otpInput = await screen.findByLabelText("Verification code (6 digits)");
    expect(otpInput).toHaveAttribute("aria-invalid", "true");

    fireEvent.change(otpInput, { target: { value: "1" } });
    expect(otpInput).toHaveAttribute("aria-invalid", "false");
  });

  it("sends otpCode as a six-character string in the submit payload", async () => {
    await renderAtSignStage();
    mockPost.mockResolvedValueOnce({ data: { message: "OTP sent" } });
    fireEvent.click(screen.getByRole("button", { name: /require otp verification/i }));
    const otpInput = await screen.findByLabelText("Verification code (6 digits)");

    fireEvent.change(otpInput, { target: { value: "123456" } });

    mockPost.mockResolvedValueOnce({ data: {} });
    fireEvent.click(screen.getByRole("button", { name: /submit signature/i }));

    await screen.findByText(/signature recorded/i);

    const submitCall = mockPost.mock.calls.find(([url]) =>
      typeof url === "string" && url.includes("/submit"),
    );
    expect(submitCall).toBeDefined();
    const [, body] = submitCall as [string, Record<string, unknown>];
    expect(body.otpCode).toBe("123456");
    expect((body.otpCode as string)).toHaveLength(6);
  });
});
