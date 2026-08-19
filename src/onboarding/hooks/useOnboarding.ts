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
  /** Pass user.isFirstLogin from the backend — forces welcome even if localStorage says done */
  isFirstLogin?: boolean;
  /** Called when user completes or skips welcome — use to mark IsFirstLogin=false on backend */
  onWelcomeDone?: () => void;
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
  openWhatsNew: () => void;

  // Help center / replay
  openHelp: () => void;
  helpOpen: boolean;
  closeHelp: () => void;
  replayTour: (tourId: string) => void;

  // Debug
  resetOnboarding: () => void;
}

export function useOnboarding({ userId, role, isFirstLogin = false, onWelcomeDone }: UseOnboardingOptions): OnboardingControls {
  const flags = useMemo(() => getOnboardingFlags(), []);
  const location = useLocation();

  const [state, setState] = useState<UserOnboardingState>(() =>
    onboardingStorage.load(userId, role)
  );
  const [activeTour, setActiveTour] = useState<TourDefinition | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [firstLoginFlowActive, setFirstLoginFlowActive] = useState(isFirstLogin);
  const [whatsNewManualOpen, setWhatsNewManualOpen] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (isFirstLogin) setFirstLoginFlowActive(true);
  }, [isFirstLogin]);

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
  // Welcome + auto What's New only during the backend first-login flow (IsFirstLogin).
  // After that, tours and release notes are opened from the Help widget only.
  const showWelcome = flags.enabled && firstLoginFlowActive && !state.firstLoginCompleted;

  const completeWelcome = useCallback((focusArea: FocusArea) => {
    onboardingAnalytics.emit("onboarding_started", { userId, role, focusArea });
    onboardingAnalytics.emit("focus_area_selected", { userId, focusArea });
    setState((prev) => ({
      ...prev,
      firstLoginCompleted: true,
      selectedFocusArea: focusArea,
    }));
    onWelcomeDone?.();
    // Auto-start quick tour after welcome
    if (flags.quickTour) setActiveTour(quickTour);
  }, [userId, role, flags.quickTour, onWelcomeDone]);

  const skipWelcome = useCallback(() => {
    onboardingAnalytics.emit("onboarding_skipped", { userId, role });
    setState((prev) => ({
      ...prev,
      firstLoginCompleted: true,
      quickTourSkipped: true,
    }));
    setFirstLoginFlowActive(false);
    onWelcomeDone?.();
  }, [userId, role, onWelcomeDone]);

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

  // Auto What's New once during first-login onboarding (after welcome), not on every release.
  const showWhatsNewAuto = flags.enabled && flags.whatsNew
    && firstLoginFlowActive
    && state.firstLoginCompleted
    && whatsNewEntries.length > 0
    && !activeTour
    && !showWelcome;

  const showWhatsNew = showWhatsNewAuto || whatsNewManualOpen;

  const dismissWhatsNew = useCallback(() => {
    const versions = whatsNewEntries.map((e) => e.version);
    onboardingAnalytics.emit("whats_new_dismissed", { userId, versions });
    setState((prev) => ({
      ...prev,
      lastSeenAppVersion: APP_VERSION,
      whatsNewSeenVersions: [...new Set([...prev.whatsNewSeenVersions, ...versions])],
    }));
    setWhatsNewManualOpen(false);
    setFirstLoginFlowActive(false);
  }, [userId, whatsNewEntries]);

  const openWhatsNew = useCallback(() => {
    setWhatsNewManualOpen(true);
  }, []);

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
    openWhatsNew,
    openHelp,
    helpOpen,
    closeHelp,
    replayTour,
    resetOnboarding,
  };
}
