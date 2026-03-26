// Onboarding feature flags — flip these to enable/disable onboarding modules globally.
// Can be overridden at runtime via localStorage key "onboarding_flags_override" (JSON).

export const APP_VERSION = "1.2.0"; // bump this with each release to trigger What's New

interface OnboardingFlags {
  enabled: boolean;
  quickTour: boolean;
  contextHints: boolean;
  videos: boolean;
  whatsNew: boolean;
  roleTours: boolean;
  /** Shows debug reset button — true in dev automatically */
  debugMode: boolean;
}

const defaults: OnboardingFlags = {
  enabled: true,
  quickTour: true,
  contextHints: true,
  videos: false,      // enable when videos are available
  whatsNew: true,
  roleTours: true,
  debugMode: import.meta.env.DEV,
};

function loadOverrides(): Partial<OnboardingFlags> {
  try {
    const raw = localStorage.getItem("onboarding_flags_override");
    if (raw) return JSON.parse(raw) as Partial<OnboardingFlags>;
  } catch {
    // ignore
  }
  return {};
}

export function getOnboardingFlags(): OnboardingFlags {
  return { ...defaults, ...loadOverrides() };
}
