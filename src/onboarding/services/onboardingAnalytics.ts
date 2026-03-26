// Onboarding analytics — fires events to console in dev, swappable for real analytics
// Replace the `emit` function body to wire into Segment, Mixpanel, etc.

export type OnboardingEvent =
  | "onboarding_started"
  | "onboarding_completed"
  | "onboarding_skipped"
  | "tour_started"
  | "tour_step_viewed"
  | "tour_abandoned"
  | "tour_completed"
  | "video_played"
  | "video_completed"
  | "hint_dismissed"
  | "hint_shown"
  | "help_reopened"
  | "replay_requested"
  | "guided_task_completed"
  | "whats_new_shown"
  | "whats_new_dismissed"
  | "focus_area_selected";

interface EventPayload {
  userId?: string;
  role?: string;
  tourId?: string;
  stepId?: string;
  stepIndex?: number;
  hintId?: string;
  videoId?: string;
  focusArea?: string;
  version?: string;
  [key: string]: unknown;
}

function emit(event: OnboardingEvent, payload: EventPayload = {}) {
  if (import.meta.env.DEV) {
    console.debug(`[onboarding] ${event}`, payload);
  }
  // TODO: wire into real analytics provider here
  // analytics.track(event, payload);
}

export const onboardingAnalytics = { emit };
