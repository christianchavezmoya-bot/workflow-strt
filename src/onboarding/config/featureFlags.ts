import { isProdAppBuild } from "../../utils/appEnvironment";

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
  if (isProdAppBuild()) return {};
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
