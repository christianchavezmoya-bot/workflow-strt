import axios from "axios";
import type { OnboardingEvent, EventPayload } from "../onboarding/services/onboardingAnalytics";

// Use a plain axios instance — no auth interceptors, no 401 redirect.
// The endpoint is AllowAnonymous so no token is needed.
const getBaseUrl = () => {
  if (import.meta.env.VITE_API_BASE) return import.meta.env.VITE_API_BASE;
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:4000/api`;
};

const analyticsAxios = axios.create({ baseURL: getBaseUrl() });

interface QueuedEvent {
  id: string;
  eventName: string;
  userId?: string;
  role?: string;
  occurredAtUtc: string;
  payload: EventPayload;
}

const QUEUE_KEY = "commtrac_analytics_queue_v1";

function readQueue(): QueuedEvent[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedEvent[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(q: QueuedEvent[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {
    // localStorage quota exceeded — drop oldest event
  }
}

async function flush(): Promise<void> {
  const queue = readQueue();
  if (queue.length === 0) return;

  try {
    await analyticsAxios.post("/analytics/events", {
      events: queue.map((e) => ({
        eventName:     e.eventName,
        userId:        e.userId,
        role:          e.role,
        occurredAtUtc: e.occurredAtUtc,
        payload:       e.payload,
      })),
    });
    writeQueue([]);
  } catch {
    // Leave queue intact — will retry on next flush
  }
}

export const analyticsService = {
  /**
   * Queue an event locally and attempt an immediate flush.
   * When offline the event stays in localStorage until the next
   * successful flush (triggered by the `online` event or next emit call).
   */
  async track(
    eventName: OnboardingEvent,
    payload: EventPayload = {},
    userId?: string,
    role?: string
  ): Promise<void> {
    const item: QueuedEvent = {
      id: crypto.randomUUID(),
      eventName,
      userId,
      role,
      occurredAtUtc: new Date().toISOString(),
      payload,
    };
    writeQueue([...readQueue(), item]);

    if (navigator.onLine) {
      await flush();
    }
  },

  flush,
};

// Auto-flush when connectivity returns
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    void analyticsService.flush();
  });
}
