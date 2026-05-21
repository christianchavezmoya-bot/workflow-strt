import { describe, it, expect, vi, beforeEach } from "vitest";
import { onboardingAnalytics } from "../../onboarding/services/onboardingAnalytics";
import { analyticsService } from "../../services/analyticsService";

vi.mock("../../services/analyticsService");

describe("onboardingAnalytics.emit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls analyticsService.track with the correct event name", () => {
    vi.mocked(analyticsService.track).mockResolvedValue(undefined);
    onboardingAnalytics.emit("onboarding_started", { userId: "u1", role: "Admin" });
    expect(analyticsService.track).toHaveBeenCalledWith(
      "onboarding_started",
      expect.not.objectContaining({ userId: expect.anything() }),
      "u1",
      "Admin"
    );
  });

  it("tolerates missing payload gracefully", () => {
    vi.mocked(analyticsService.track).mockResolvedValue(undefined);
    expect(() => onboardingAnalytics.emit("tour_completed")).not.toThrow();
    expect(analyticsService.track).toHaveBeenCalledOnce();
  });

  it("passes extra payload fields through", () => {
    vi.mocked(analyticsService.track).mockResolvedValue(undefined);
    onboardingAnalytics.emit("tour_step_viewed", { stepId: "s1", stepIndex: 2 });
    expect(analyticsService.track).toHaveBeenCalledWith(
      "tour_step_viewed",
      { stepId: "s1", stepIndex: 2 },
      undefined,
      undefined
    );
  });
});
