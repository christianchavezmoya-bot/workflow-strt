import { useEffect } from "react";

/**
 * Re-runs `onUpdate` whenever any of the given event names fire on window.
 * Use this to keep page data fresh when background repo syncs complete.
 *
 * Example:
 *   useRepoSubscription(["repo:assets:updated"], () => void loadAssets());
 */
export function useRepoSubscription(events: string[], onUpdate: () => void): void {
  useEffect(() => {
    const handler = () => onUpdate();
    events.forEach((e) => window.addEventListener(e, handler));
    return () => events.forEach((e) => window.removeEventListener(e, handler));
  }, [events.join(","), onUpdate]); // eslint-disable-line react-hooks/exhaustive-deps
}
