// Onboarding analytics — fires events to console in dev, stores to backend in production.
import { analyticsService } from "../../services/analyticsService";

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

  // Pull userId/role out of payload for indexed columns on the server;
  // the rest goes into PayloadJson.
  const { userId, role, ...rest } = payload;
  void analyticsService.track(
    event,
    rest,
    typeof userId === "string" ? userId : undefined,
    typeof role   === "string" ? role   : undefined
  );
}

export const onboardingAnalytics = { emit };
