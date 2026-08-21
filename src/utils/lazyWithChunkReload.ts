import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { attemptChunkReload, isStaleChunkError } from "./staleChunkError";

/**
 * Route-level lazy() wrapper: on stale chunk after deploy, reload once so the
 * browser picks up the current index.html and hashed assets.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mirrors React.lazy's factory typing
export function lazyWithChunkReload<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await factory();
    } catch (error) {
      if (isStaleChunkError(error) && attemptChunkReload()) {
        // Reload in flight — keep Suspense fallback until navigation completes.
        return await new Promise<{ default: T }>(() => {});
      }
      throw error;
    }
  });
}
