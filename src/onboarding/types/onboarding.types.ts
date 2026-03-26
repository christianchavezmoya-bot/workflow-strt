// ─── Onboarding Types ─────────────────────────────────────────────────────────

export type FocusArea =
  | "build_workflows"
  | "manage_projects"
  | "run_field_jobs"
  | "inspections"
  | "reports_review";

export type TourType =
  | "quick_tour"
  | "page_tour"
  | "role_tour"
  | "guided_task"
  | "whats_new"
  | "video";

export type StepPlacement = "top" | "bottom" | "left" | "right" | "center";
export type StepActionType = "highlight" | "modal" | "tooltip" | "redirect" | "video" | "task";

export interface TourStep {
  id: string;
  pageKey?: string;
  /** value of data-tour="..." attribute on the target element */
  targetSelector?: string;
  title: string;
  body: string;
  placement: StepPlacement;
  actionType: StepActionType;
  order: number;
  optional?: boolean;
  nextPageKey?: string;
  requiredRole?: string[];
  analyticsKey?: string;
}

export interface TourDefinition {
  id: string;
  name: string;
  type: TourType;
  /** empty = all roles */
  roleTargets: string[];
  /** empty = global (not page-specific) */
  pageTargets: string[];
  versionIntroduced: string;
  active: boolean;
  steps: TourStep[];
}

export interface HintDefinition {
  id: string;
  pageKey: string;
  roleTargets: string[];
  title: string;
  body: string;
  targetSelector?: string;
  placement?: StepPlacement;
  dismissible: boolean;
  showOnce: boolean;
  priority: number;
  active: boolean;
}

export interface WhatsNewBullet {
  text: string;
  tourId?: string;
  pageKey?: string;
}

export interface WhatsNewEntry {
  version: string;
  releaseDate: string;
  title: string;
  bullets: WhatsNewBullet[];
  active: boolean;
}

// ─── Per-User State ────────────────────────────────────────────────────────────

export interface UserOnboardingState {
  userId: string;
  role: string;
  selectedFocusArea: FocusArea | null;
  firstLoginCompleted: boolean;
  quickTourCompleted: boolean;
  quickTourSkipped: boolean;
  completedTourIds: string[];
  dismissedHintIds: string[];
  watchedVideoIds: string[];
  /** pageKey -> visit count */
  pageVisitCounts: Record<string, number>;
  lastSeenAppVersion: string;
  whatsNewSeenVersions: string[];
  doNotShowAgainHints: string[];
  createdAt: string;
  updatedAt: string;
}

export const makeDefaultOnboardingState = (userId: string, role: string): UserOnboardingState => ({
  userId,
  role,
  selectedFocusArea: null,
  firstLoginCompleted: false,
  quickTourCompleted: false,
  quickTourSkipped: false,
  completedTourIds: [],
  dismissedHintIds: [],
  watchedVideoIds: [],
  pageVisitCounts: {},
  lastSeenAppVersion: "",
  whatsNewSeenVersions: [],
  doNotShowAgainHints: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});
