import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

/** Requests OTP, enters a code, and verifies it (mocking a successful /verify-otp call). */
async function requestAndVerifyOtp(code = "123456") {
  mockPost.mockResolvedValueOnce({ data: { message: "OTP sent" } });
  fireEvent.click(screen.getByRole("button", { name: /require otp verification/i }));
  const otpInput = await screen.findByLabelText("Verification code (6 digits)");
  fireEvent.change(otpInput, { target: { value: code } });

  mockPost.mockResolvedValueOnce({ data: { verified: true } });
  fireEvent.click(screen.getByRole("button", { name: /^verify code$/i }));
  await screen.findByText(/verification code confirmed/i);
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

  // ── The actual reported bug: acknowledging must never substitute for OTP verification ──

  it("hides the acknowledgement checkbox once OTP is requested, before it is verified", async () => {
    await renderAtSignStage();
    // Checkbox is present pre-OTP (the optional-OTP path) — renderAtSignStage already ticked it.
    expect(screen.getByRole("checkbox")).toBeInTheDocument();

    mockPost.mockResolvedValueOnce({ data: { message: "OTP sent" } });
    fireEvent.click(screen.getByRole("button", { name: /require otp verification/i }));
    await screen.findByLabelText("Verification code (6 digits)");

    // Hidden, not merely disabled: it must not exist in the DOM at all.
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("keeps Submit Signature disabled while OTP is requested but not yet verified, regardless of prior acknowledgement", async () => {
    await renderAtSignStage(); // ticked the checkbox before OTP was ever requested
    mockPost.mockResolvedValueOnce({ data: { message: "OTP sent" } });
    fireEvent.click(screen.getByRole("button", { name: /require otp verification/i }));
    await screen.findByLabelText("Verification code (6 digits)");

    const submitButton = screen.getByRole("button", { name: /submit signature/i });
    expect(submitButton).toBeDisabled();
  });

  it("reveals the acknowledgement checkbox only after OTP is successfully verified, and Submit then requires re-ticking it", async () => {
    await renderAtSignStage();
    await requestAndVerifyOtp();

    // Checkbox reappears (previous tick was on a since-unmounted control — not retained).
    const checkbox = await screen.findByRole("checkbox");
    expect(checkbox).toBeInTheDocument();
    const submitButton = screen.getByRole("button", { name: /submit signature/i });
    expect(submitButton).toBeDisabled();

    fireEvent.click(checkbox);
    expect(submitButton).not.toBeDisabled();
  });

  it("re-hides the acknowledgement checkbox if the OTP code is edited before it has been verified", async () => {
    await renderAtSignStage();
    mockPost.mockResolvedValueOnce({ data: { message: "OTP sent" } });
    fireEvent.click(screen.getByRole("button", { name: /require otp verification/i }));
    const otpInput = await screen.findByLabelText("Verification code (6 digits)");

    fireEvent.change(otpInput, { target: { value: "654321" } });

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit signature/i })).toBeDisabled();
  });

  it("shows a field-level error and does not verify when the code is rejected by /verify-otp", async () => {
    await renderAtSignStage();
    mockPost.mockResolvedValueOnce({ data: { message: "OTP sent" } });
    fireEvent.click(screen.getByRole("button", { name: /require otp verification/i }));
    const otpInput = await screen.findByLabelText("Verification code (6 digits)");
    fireEvent.change(otpInput, { target: { value: "000000" } });

    mockPost.mockRejectedValueOnce({
      response: { status: 400, data: { message: "Incorrect OTP code." } },
    });
    fireEvent.click(screen.getByRole("button", { name: /^verify code$/i }));

    await waitFor(() => expect(otpInput).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getAllByText("Incorrect OTP code.").length).toBeGreaterThan(0);
    // Still not revealed — a rejected verify must not leak through to the acknowledgement step.
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("clears the field-level error state when the OTP is edited", async () => {
    await renderAtSignStage();
    mockPost.mockResolvedValueOnce({ data: { message: "OTP sent" } });
    fireEvent.click(screen.getByRole("button", { name: /require otp verification/i }));
    const otpInput = await screen.findByLabelText("Verification code (6 digits)");
    fireEvent.change(otpInput, { target: { value: "000000" } });

    mockPost.mockRejectedValueOnce({
      response: { status: 400, data: { message: "Incorrect OTP code." } },
    });
    fireEvent.click(screen.getByRole("button", { name: /^verify code$/i }));
    await waitFor(() => expect(otpInput).toHaveAttribute("aria-invalid", "true"));

    fireEvent.change(otpInput, { target: { value: "111111" } });
    expect(otpInput).toHaveAttribute("aria-invalid", "false");
  });

  it("sends otpCode as a six-character string in the submit payload after verification", async () => {
    await renderAtSignStage();
    await requestAndVerifyOtp("123456");
    fireEvent.click(await screen.findByRole("checkbox"));

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

  it("a Submit-time OTP rejection re-hides the acknowledgement step even if it was previously verified", async () => {
    // Defense in depth: if Submit itself ever disagrees with an earlier verify-otp result
    // (e.g. the code expired in between), the UI must not remain in a falsely-verified state.
    await renderAtSignStage();
    await requestAndVerifyOtp();
    fireEvent.click(await screen.findByRole("checkbox"));

    mockPost.mockRejectedValueOnce({
      response: { status: 400, data: { message: "OTP has expired. Request a new one." } },
    });
    fireEvent.click(screen.getByRole("button", { name: /submit signature/i }));

    await waitFor(() => expect(screen.queryByRole("checkbox")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: /submit signature/i })).toBeDisabled();
  });
});
