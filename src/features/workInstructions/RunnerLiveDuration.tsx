import { memo, useEffect, useMemo, useState } from "react";
import { formatDuration } from "./workOrderRunnerUi";

export function computeLiveRunSeconds(
  baseSeconds: number,
  trackingCategory: "productive" | "downtime" | null,
  activeCategory: "productive" | "downtime",
  trackingStartedAt: string | null,
  tickNow: number,
): number {
  if (trackingCategory !== activeCategory || !trackingStartedAt) return baseSeconds;
  const startMs = Date.parse(trackingStartedAt);
  if (Number.isNaN(startMs)) return baseSeconds;
  const elapsed = Math.max(0, Math.floor((tickNow - startMs) / 1000));
  return baseSeconds + elapsed;
}

type RunnerLiveDurationProps = {
  baseSeconds: number;
  trackingCategory: "productive" | "downtime" | null;
  activeCategory: "productive" | "downtime";
  trackingStartedAt: string | null;
  /** When false, show the frozen base total (no interval). */
  enableTicker?: boolean;
};

/** Isolated 1 Hz ticker so step form fields are not re-rendered every second. */
const RunnerLiveDuration = memo(function RunnerLiveDuration({
  baseSeconds,
  trackingCategory,
  activeCategory,
  trackingStartedAt,
  enableTicker = true,
}: RunnerLiveDurationProps) {
  const [tickNow, setTickNow] = useState(() => Date.now());
  const shouldTick = enableTicker
    && trackingCategory === activeCategory
    && Boolean(trackingStartedAt);

  useEffect(() => {
    if (!shouldTick) return;
    const timer = window.setInterval(() => setTickNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [shouldTick]);

  const seconds = useMemo(
    () => computeLiveRunSeconds(baseSeconds, trackingCategory, activeCategory, trackingStartedAt, tickNow),
    [activeCategory, baseSeconds, trackingCategory, trackingStartedAt, tickNow],
  );

  return <>{formatDuration(seconds)}</>;
});

export default RunnerLiveDuration;
