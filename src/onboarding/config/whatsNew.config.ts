import type { WhatsNewEntry } from "../types/onboarding.types";

// Add a new entry here whenever a significant feature ships.
// Keep bullets to 2–4 items. Link to tour IDs where relevant.
// The What's New modal shows automatically once per version per user.

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    version: "1.2.0",
    releaseDate: "2026-03",
    title: "What's new in v1.2",
    active: true,
    bullets: [
      { text: "Upload from phone — scan a QR code to upload photos from any mobile device." },
      { text: "Tips & Tricks — a searchable knowledge base for guides and quick references.", pageKey: "/tips" },
      { text: "Password strength indicator on reset and first-login screens." },
      { text: "Improved reset password flow with better error messages." },
    ],
  },
  {
    version: "1.1.0",
    releaseDate: "2026-02",
    title: "What's new in v1.1",
    active: true,
    bullets: [
      { text: "Workflow config builder — create, publish, and assign reusable workflow templates.", pageKey: "/work-instructions" },
      { text: "Asset workflow run history — view completed and in-progress runs per asset." },
      { text: "Project contacts, delivery profiles, and inbound items tracking.", pageKey: "/projects" },
      { text: "BOM-to-Project import — convert bill of materials into live projects." },
    ],
  },
];

/** Returns What's New entries the user has NOT seen yet, newest first */
export function getUnseenWhatsNew(seenVersions: string[]): WhatsNewEntry[] {
  return WHATS_NEW
    .filter((e) => e.active && !seenVersions.includes(e.version))
    .sort((a, b) => b.version.localeCompare(a.version));
}
