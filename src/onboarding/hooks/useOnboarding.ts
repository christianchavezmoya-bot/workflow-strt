import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import type { FocusArea, TourDefinition, UserOnboardingState } from "../types/onboarding.types";
import { onboardingStorage } from "../services/onboardingStorage";
import { onboardingAnalytics } from "../services/onboardingAnalytics";
import { getOnboardingFlags, APP_VERSION } from "../config/featureFlags";
import { quickTour, getRoleTour } from "../config/tours.config";
import { getPageHint } from "../config/pageHints.config";
import { getUnseenWhatsNew } from "../config/whatsNew.config";

interface UseOnboardingOptions {
  userId: string;
  role: string;
}

export interface OnboardingControls {
  state: UserOnboardingState;
  flags: ReturnType<typeof getOnboardingFlags>;

  // Welcome
  showWelcome: boolean;
  completeWelcome: (focusArea: FocusArea) => void;
  skipWelcome: () => void;

  // Quick tour
  showQuickTour: boolean;
  activeTour: TourDefinition | null;
  startTour: (tourId?: string) => void;
  endTour: (completed: boolean) => void;
  markTourComplete: (tourId: string) => void;

  // Page hints
  currentHintId: string | null;
  dismissHint: (hintId: string) => void;

  // What's New
  showWhatsNew: boolean;
  whatsNewEntries: ReturnType<typeof getUnseenWhatsNew>;
  dismissWhatsNew: () => void;

  // Help center / replay
  openHelp: () => void;
  helpOpen: boolean;
  closeHelp: () => void;
  replayTour: (tourId: string) => void;

  // Debug
  resetOnboarding: () => void;
}

export function useOnboarding({ userId, role }: UseOnboardingOptions): OnboardingControls {
  const flags = useMemo(() => getOnboardingFlags(), []);
  const location = useLocation();

  const [state, setState] = useState<UserOnboardingState>(() =>
    onboardingStorage.load(userId, role)
  );
  const [activeTour, setActiveTour] = useState<TourDefinition | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const initialized = useRef(false);

  // Persist whenever state changes
  useEffect(() => {
    if (initialized.current) onboardingStorage.save(state);
    else initialized.current = true;
  }, [state]);

  // Track page visits
  useEffect(() => {
    if (!flags.enabled) return;
    setState((prev) => {
      const pageKey = location.pathname;
      const current = prev.pageVisitCounts[pageKey] ?? 0;
      return {
        ...prev,
        pageVisitCounts: { ...prev.pageVisitCounts, [pageKey]: current + 1 },
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // ── Welcome ────────────────────────────────────────────────────────────────
  const showWelcome = flags.enabled && !state.firstLoginCompleted;

  const completeWelcome = useCallback((focusArea: FocusArea) => {
    onboardingAnalytics.emit("onboarding_started", { userId, role, focusArea });
    onboardingAnalytics.emit("focus_area_selected", { userId, focusArea });
    setState((prev) => ({
      ...prev,
      firstLoginCompleted: true,
      selectedFocusArea: focusArea,
    }));
    // Auto-start quick tour after welcome
    if (flags.quickTour) setActiveTour(quickTour);
  }, [userId, role, flags.quickTour]);

  const skipWelcome = useCallback(() => {
    onboardingAnalytics.emit("onboarding_skipped", { userId, role });
    setState((prev) => ({
      ...prev,
      firstLoginCompleted: true,
      quickTourSkipped: true,
    }));
  }, [userId, role]);

  // ── Quick / Role Tours ────────────────────────────────────────────────────
  const showQuickTour = flags.enabled && flags.quickTour && !!activeTour;

  const startTour = useCallback((tourId?: string) => {
    const tour = tourId
      ? (tourId === "quick_tour" ? quickTour : getRoleTour(role))
      : getRoleTour(role) ?? quickTour;
    if (!tour) return;
    setActiveTour(tour);
    onboardingAnalytics.emit("tour_started", { userId, role, tourId: tour.id });
  }, [userId, role]);

  const endTour = useCallback((completed: boolean) => {
    if (!activeTour) return;
    if (completed) {
      onboardingAnalytics.emit("tour_completed", { userId, role, tourId: activeTour.id });
      setState((prev) => ({
        ...prev,
        quickTourCompleted: activeTour.id === "quick_tour" ? true : prev.quickTourCompleted,
        completedTourIds: prev.completedTourIds.includes(activeTour.id)
          ? prev.completedTourIds
          : [...prev.completedTourIds, activeTour.id],
      }));
    } else {
      onboardingAnalytics.emit("tour_abandoned", { userId, role, tourId: activeTour.id });
    }
    setActiveTour(null);
  }, [activeTour, userId, role]);

  const markTourComplete = useCallback((tourId: string) => {
    setState((prev) => ({
      ...prev,
      completedTourIds: prev.completedTourIds.includes(tourId)
        ? prev.completedTourIds
        : [...prev.completedTourIds, tourId],
    }));
  }, []);

  // ── Page Hints ────────────────────────────────────────────────────────────
  const currentHint = useMemo(() => {
    if (!flags.enabled || !flags.contextHints) return null;
    const hint = getPageHint(location.pathname, role);
    if (!hint) return null;
    if (state.dismissedHintIds.includes(hint.id)) return null;
    if (state.doNotShowAgainHints.includes(hint.id)) return null;
    const visits = state.pageVisitCounts[location.pathname] ?? 0;
    if (hint.showOnce && visits > 1) return null;
    return hint;
  }, [flags, location.pathname, role, state.dismissedHintIds, state.doNotShowAgainHints, state.pageVisitCounts]);

  const dismissHint = useCallback((hintId: string) => {
    onboardingAnalytics.emit("hint_dismissed", { userId, hintId });
    setState((prev) => ({
      ...prev,
      dismissedHintIds: prev.dismissedHintIds.includes(hintId)
        ? prev.dismissedHintIds
        : [...prev.dismissedHintIds, hintId],
    }));
  }, [userId]);

  // ── What's New ────────────────────────────────────────────────────────────
  const whatsNewEntries = useMemo(
    () => flags.whatsNew ? getUnseenWhatsNew(state.whatsNewSeenVersions) : [],
    [flags.whatsNew, state.whatsNewSeenVersions]
  );

  // Show What's New only after onboarding is complete and there are unseen entries
  const showWhatsNew = flags.enabled && flags.whatsNew
    && state.firstLoginCompleted
    && whatsNewEntries.length > 0
    && !activeTour
    && !showWelcome;

  const dismissWhatsNew = useCallback(() => {
    const versions = whatsNewEntries.map((e) => e.version);
    onboardingAnalytics.emit("whats_new_dismissed", { userId, versions });
    setState((prev) => ({
      ...prev,
      lastSeenAppVersion: APP_VERSION,
      whatsNewSeenVersions: [...new Set([...prev.whatsNewSeenVersions, ...versions])],
    }));
  }, [userId, whatsNewEntries]);

  // ── Help center ───────────────────────────────────────────────────────────
  const openHelp = useCallback(() => {
    onboardingAnalytics.emit("help_reopened", { userId, role });
    setHelpOpen(true);
  }, [userId, role]);

  const closeHelp = useCallback(() => setHelpOpen(false), []);

  const replayTour = useCallback((tourId: string) => {
    onboardingAnalytics.emit("replay_requested", { userId, role, tourId });
    setHelpOpen(false);
    const tour = tourId === "quick_tour" ? quickTour : getRoleTour(role);
    if (tour) setActiveTour(tour);
  }, [userId, role]);

  // ── Debug ─────────────────────────────────────────────────────────────────
  const resetOnboarding = useCallback(() => {
    const fresh = onboardingStorage.reset(userId, role);
    setState(fresh);
    setActiveTour(null);
    setHelpOpen(false);
  }, [userId, role]);

  return {
    state,
    flags,
    showWelcome,
    completeWelcome,
    skipWelcome,
    showQuickTour,
    activeTour,
    startTour,
    endTour,
    markTourComplete,
    currentHintId: currentHint?.id ?? null,
    dismissHint,
    showWhatsNew,
    whatsNewEntries,
    dismissWhatsNew,
    openHelp,
    helpOpen,
    closeHelp,
    replayTour,
    resetOnboarding,
  };
}
