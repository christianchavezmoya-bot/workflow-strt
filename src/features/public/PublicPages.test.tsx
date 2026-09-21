import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import PrivacyPolicyPage from "./PrivacyPolicyPage";
import SupportPage from "./SupportPage";
import { PRIVACY_URL, SUPPORT_EMAIL } from "./publicSite";

// Maps NSPrivacyCollectedDataType suffixes in PrivacyInfo.xcprivacy to the headings
// the policy must show, so the page cannot silently drift from the App Store declarations.
const MANIFEST_TYPE_TO_HEADING: Record<string, string> = {
  EmailAddress: "Email Address",
  Name: "Name",
  PhoneNumber: "Phone Number",
  PhysicalAddress: "Physical Address",
  PhotosorVideos: "Photos or Videos",
  OtherUserContent: "Other User Content",
  DeviceID: "Device ID",
};

describe("SupportPage", () => {
  it("renders every required section", () => {
    render(<SupportPage />);
    expect(screen.getByRole("heading", { level: 1, name: /Strata N-go Support/i })).toBeInTheDocument();
    for (const heading of ["Getting Help", "Common Help Topics", "Offline Use", "Account Access", "Privacy", "Contact Support"]) {
      expect(screen.getByRole("heading", { level: 2, name: heading })).toBeInTheDocument();
    }
    for (const topic of [
      "Signing in and account access",
      "Password reset",
      "Projects and assets",
      "Workflows and inspections",
      "Photos and field evidence",
      "Offline operation and synchronization",
      "Issues and reporting",
    ]) {
      expect(screen.getByRole("heading", { level: 3, name: topic })).toBeInTheDocument();
    }
  });

  it("uses the approved support address and links to the public privacy policy", () => {
    render(<SupportPage />);
    expect(screen.getByRole("link", { name: SUPPORT_EMAIL })).toHaveAttribute("href", `mailto:${SUPPORT_EMAIL}`);
    const policyLinks = screen.getAllByRole("link", { name: "Privacy Policy" });
    expect(policyLinks.length).toBeGreaterThan(0);
    for (const link of policyLinks) expect(link).toHaveAttribute("href", PRIVACY_URL);
  });

  it("sets the document title", () => {
    render(<SupportPage />);
    expect(document.title).toBe("Support · Strata N-go");
  });
});

describe("PrivacyPolicyPage", () => {
  it("covers every data type declared in PrivacyInfo.xcprivacy", () => {
    const xml = readFileSync(resolve(__dirname, "../../../ios/App/App/PrivacyInfo.xcprivacy"), "utf8");
    const declared = [...xml.matchAll(/<string>NSPrivacyCollectedDataType([A-Za-z]+)<\/string>/g)]
      .map((m) => m[1])
      .filter((t) => !t.startsWith("Purpose"));
    expect(declared.sort()).toEqual(Object.keys(MANIFEST_TYPE_TO_HEADING).sort());

    render(<PrivacyPolicyPage />);
    for (const type of declared) {
      expect(screen.getByRole("heading", { level: 3, name: MANIFEST_TYPE_TO_HEADING[type] })).toBeInTheDocument();
    }
  });

  it("explains collection, use, third parties, retention/deletion and requests", () => {
    render(<PrivacyPolicyPage />);
    for (const heading of [
      "Information we collect and how",
      "Why we use your information",
      "Who receives or processes your information",
      "How we protect and store information",
      "How long we keep information and how to delete it",
      "Your choices and requests",
      "Contact us",
    ]) {
      expect(screen.getByRole("heading", { level: 2, name: heading })).toBeInTheDocument();
    }
    for (const provider of ["Amazon Web Services", "Resend", "OpenStreetMap"]) {
      expect(screen.getByText(provider)).toBeInTheDocument();
    }
  });

  it("uses only the approved support address", () => {
    render(<PrivacyPolicyPage />);
    expect(screen.getByRole("link", { name: SUPPORT_EMAIL })).toHaveAttribute("href", `mailto:${SUPPORT_EMAIL}`);
  });
});

describe("public pages hygiene", () => {
  it.each([
    ["SupportPage", SupportPage],
    ["PrivacyPolicyPage", PrivacyPolicyPage],
  ])("%s shows no dev/staging/debug identifiers or forbidden addresses", (_name, Page) => {
    const { container } = render(<Page />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\b(dev|staging|debug|localhost)\b/i);
    expect(text).not.toMatch(/noreply@|hotmail|\.local\b|example\.com/i);
    expect(container.querySelector("a[href*='staging'], a[href*='localhost']")).toBeNull();
  });
});
