import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("axios", () => {
  const mockPost = vi.fn();
  const create = vi.fn(() => ({ post: mockPost }));
  return { default: { create, post: mockPost } };
});

// Import after mock is set up
import axios from "axios";
import { analyticsService } from "../../services/analyticsService";

const QUEUE_KEY = "commtrac_analytics_queue_v1";
const mockPost = (axios.create as ReturnType<typeof vi.fn>)().post as ReturnType<typeof vi.fn>;

describe("analyticsService", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });
  });

  it("flushes immediately when online and clears queue on success", async () => {
    mockPost.mockResolvedValue({ data: null });
    await analyticsService.track("video_played", { videoId: "v1" });
    expect(localStorage.getItem(QUEUE_KEY)).toBeNull();
  });

  it("retains events in queue when offline", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, writable: true, configurable: true });
    await analyticsService.track("tour_started");
    const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
    expect(queue).toHaveLength(1);
    expect(queue[0].eventName).toBe("tour_started");
  });

  it("retains events in queue when POST fails", async () => {
    mockPost.mockRejectedValue(new Error("network"));
    await analyticsService.track("hint_shown");
    const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
    expect(queue).toHaveLength(1);
  });

  it("flushes accumulated queue as a single batch", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, writable: true, configurable: true });
    await analyticsService.track("onboarding_started");
    await analyticsService.track("tour_step_viewed");

    Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });
    mockPost.mockResolvedValue({ data: null });
    await analyticsService.flush();

    expect(mockPost).toHaveBeenCalledOnce();
    const body = mockPost.mock.calls[0][1] as { events: unknown[] };
    expect(body.events).toHaveLength(2);
    expect(localStorage.getItem(QUEUE_KEY)).toBeNull();
  });
});
