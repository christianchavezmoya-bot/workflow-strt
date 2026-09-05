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

const baseSummary: PublicRunSummary = {
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

/** A link where OTP was never issued — the legitimate OTP-disabled configuration. */
const otpDisabledSummary: PublicRunSummary = { ...baseSummary, otpRequired: false };

/** A link where OTP is required — server truth from GetSummary, known before any UI action. */
const otpRequiredSummary: PublicRunSummary = { ...baseSummary, otpRequired: true };

async function renderAtSignStage(summary: PublicRunSummary) {
  mockGet.mockResolvedValue({ data: summary });
  render(<ExternalSignPage />);

  const proceedButton = await screen.findByRole("button", { name: /proceed to sign/i });
  fireEvent.click(proceedButton);

  const nameField = await screen.findByLabelText(/your full name/i);
  fireEvent.change(nameField, { target: { value: "Jane Signer" } });
}

/** Requests OTP, enters a code, and verifies it (mocking a successful /verify-otp call). */
async function requestAndVerifyOtp(code = "123456") {
  mockPost.mockResolvedValueOnce({ data: { message: "OTP sent" } });
  fireEvent.click(screen.getByRole("button", { name: /^request otp$/i }));
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

  describe("OTP required (server truth from GetSummary)", () => {
    it("initial state: shows a real, visible 'Request OTP' button; no acknowledgement; Submit not usable", async () => {
      await renderAtSignStage(otpRequiredSummary);

      const otpButton = screen.getByRole("button", { name: /^request otp$/i });
      expect(otpButton.tagName).toBe("BUTTON");

      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /submit signature/i })).toBeDisabled();
    });

    it("does not show any OTP entry field or 'Verify OTP' button before Request OTP is clicked", async () => {
      await renderAtSignStage(otpRequiredSummary);

      expect(screen.queryByLabelText("Verification code (6 digits)")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^verify code$/i })).not.toBeInTheDocument();
    });

    it("OTP requested: shows the code field and 'Verify OTP' button; acknowledgement still absent", async () => {
      await renderAtSignStage(otpRequiredSummary);
      mockPost.mockResolvedValueOnce({ data: { message: "OTP sent" } });
      fireEvent.click(screen.getByRole("button", { name: /^request otp$/i }));

      expect(await screen.findByLabelText("Verification code (6 digits)")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^verify code$/i })).toBeInTheDocument();
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
      expect(mockPost).toHaveBeenCalledWith(
        expect.stringContaining("/public/sign/test-token-id/request-otp"),
      );
      // The initial "Request OTP" call-to-action must not still be present.
      expect(screen.queryByRole("button", { name: /^request otp$/i })).not.toBeInTheDocument();
    });

    it("wrong OTP: verification fails, acknowledgement remains absent, Submit remains unavailable", async () => {
      await renderAtSignStage(otpRequiredSummary);
      mockPost.mockResolvedValueOnce({ data: { message: "OTP sent" } });
      fireEvent.click(screen.getByRole("button", { name: /^request otp$/i }));
      const otpInput = await screen.findByLabelText("Verification code (6 digits)");
      fireEvent.change(otpInput, { target: { value: "000000" } });

      mockPost.mockRejectedValueOnce({
        response: { status: 400, data: { message: "Incorrect OTP code." } },
      });
      fireEvent.click(screen.getByRole("button", { name: /^verify code$/i }));

      await waitFor(() => expect(otpInput).toHaveAttribute("aria-invalid", "true"));
      expect(screen.getAllByText("Incorrect OTP code.").length).toBeGreaterThan(0);
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /submit signature/i })).toBeDisabled();
    });

    it("successful verification reveals the acknowledgement checkbox", async () => {
      await renderAtSignStage(otpRequiredSummary);
      await requestAndVerifyOtp();

      expect(await screen.findByRole("checkbox")).toBeInTheDocument();
    });

    it("Submit stays disabled while acknowledgement is unchecked, and becomes enabled once checked", async () => {
      await renderAtSignStage(otpRequiredSummary);
      await requestAndVerifyOtp();

      const checkbox = await screen.findByRole("checkbox");
      const submitButton = screen.getByRole("button", { name: /submit signature/i });
      expect(checkbox).not.toBeChecked();
      expect(submitButton).toBeDisabled();

      fireEvent.click(checkbox);
      expect(checkbox).toBeChecked();
      expect(submitButton).not.toBeDisabled();
    });

    it("re-request/reset: a Submit-time invalidation clears a prior tick, and editing the code again keeps it cleared", async () => {
      await renderAtSignStage(otpRequiredSummary);
      await requestAndVerifyOtp();
      fireEvent.click(await screen.findByRole("checkbox"));
      expect(screen.getByRole("button", { name: /submit signature/i })).not.toBeDisabled();

      mockPost.mockRejectedValueOnce({
        response: { status: 400, data: { message: "OTP has expired. Request a new one." } },
      });
      fireEvent.click(screen.getByRole("button", { name: /submit signature/i }));
      await waitFor(() => expect(screen.queryByRole("checkbox")).not.toBeInTheDocument());

      // Now back in the OTP-entry stage (not the initial "Request OTP" stage) — editing the
      // code must keep the acknowledgement step cleared/hidden rather than silently restoring it.
      const otpInput = await screen.findByLabelText("Verification code (6 digits)");
      fireEvent.change(otpInput, { target: { value: "111222" } });
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /submit signature/i })).toBeDisabled();
    });

    it("clears the field-level error when the OTP code is edited", async () => {
      await renderAtSignStage(otpRequiredSummary);
      mockPost.mockResolvedValueOnce({ data: { message: "OTP sent" } });
      fireEvent.click(screen.getByRole("button", { name: /^request otp$/i }));
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
      await renderAtSignStage(otpRequiredSummary);
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
      // (e.g. the code expired in between), the UI must not remain in a falsely-verified state,
      // and must fall back to the OTP-entry stage rather than the initial "Request OTP" stage.
      await renderAtSignStage(otpRequiredSummary);
      await requestAndVerifyOtp();
      fireEvent.click(await screen.findByRole("checkbox"));

      mockPost.mockRejectedValueOnce({
        response: { status: 400, data: { message: "OTP has expired. Request a new one." } },
      });
      fireEvent.click(screen.getByRole("button", { name: /submit signature/i }));

      await waitFor(() => expect(screen.queryByRole("checkbox")).not.toBeInTheDocument());
      expect(screen.getByRole("button", { name: /submit signature/i })).toBeDisabled();
      expect(await screen.findByLabelText("Verification code (6 digits)")).toBeInTheDocument();
    });
  });

  describe("OTP disabled (legitimate configuration — otpRequired: false)", () => {
    it("shows the acknowledgement checkbox immediately, with no OTP UI at all", async () => {
      await renderAtSignStage(otpDisabledSummary);

      expect(screen.getByRole("checkbox")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /request otp/i })).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Verification code (6 digits)")).not.toBeInTheDocument();
    });

    it("Submit becomes enabled once acknowledged, with no OTP step in the way", async () => {
      await renderAtSignStage(otpDisabledSummary);

      const checkbox = screen.getByRole("checkbox");
      const submitButton = screen.getByRole("button", { name: /submit signature/i });
      expect(submitButton).toBeDisabled();

      fireEvent.click(checkbox);
      expect(submitButton).not.toBeDisabled();

      mockPost.mockResolvedValueOnce({ data: {} });
      fireEvent.click(submitButton);
      await screen.findByText(/signature recorded/i);

      const submitCall = mockPost.mock.calls.find(([url]) =>
        typeof url === "string" && url.includes("/submit"),
      );
      const [, body] = submitCall as [string, Record<string, unknown>];
      expect(body.otpCode).toBeUndefined();
    });
  });
});
