import type { UserOnboardingState } from "../types/onboarding.types";
import { makeDefaultOnboardingState } from "../types/onboarding.types";

const KEY_PREFIX = "onboarding_state_v1_";

function key(userId: string) {
  return `${KEY_PREFIX}${userId}`;
}

export const onboardingStorage = {
  load(userId: string, role: string): UserOnboardingState {
    try {
      const raw = localStorage.getItem(key(userId));
      if (raw) {
        const parsed = JSON.parse(raw) as UserOnboardingState;
        // ensure new fields exist if state was created by older version
        return { ...makeDefaultOnboardingState(userId, role), ...parsed };
      }
    } catch {
      // corrupt data — reset
    }
    return makeDefaultOnboardingState(userId, role);
  },

  save(state: UserOnboardingState): void {
    try {
      localStorage.setItem(key(state.userId), JSON.stringify({
        ...state,
        updatedAt: new Date().toISOString(),
      }));
    } catch {
      // storage full or private mode
    }
  },

  reset(userId: string, role: string): UserOnboardingState {
    const fresh = makeDefaultOnboardingState(userId, role);
    try {
      localStorage.removeItem(key(userId));
    } catch {
      // ignore
    }
    return fresh;
  },

  /** Patch specific fields without a full replacement */
  patch(userId: string, role: string, patch: Partial<UserOnboardingState>): UserOnboardingState {
    const current = onboardingStorage.load(userId, role);
    const updated = { ...current, ...patch, updatedAt: new Date().toISOString() };
    onboardingStorage.save(updated);
    return updated;
  },
};
