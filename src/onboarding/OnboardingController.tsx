/**
 * OnboardingController — mounts inside AppShell.
 * Accepts controls from the parent so all onboarding UI shares one state instance.
 * Completely self-contained: remove OnboardingLayer from AppShell to disable everything.
 */
import type { OnboardingControls } from "./hooks/useOnboarding";
import { getRoleTour } from "./config/tours.config";
import OnboardingWelcomeModal from "./components/OnboardingWelcomeModal";
import TourOverlay from "./components/TourOverlay";
import ContextHintBubble from "./components/ContextHintBubble";
import WhatsNewModal from "./components/WhatsNewModal";

interface Props {
  controls: OnboardingControls;
  userId: string;
  role: string;
  userName?: string;
}

export default function OnboardingController({ controls, userId, role, userName }: Props) {
  const {
    flags,
    showWelcome, completeWelcome, skipWelcome,
    activeTour, showQuickTour, endTour, startTour,
    currentHintId, dismissHint,
    showWhatsNew, whatsNewEntries, dismissWhatsNew,
  } = controls;

  if (!flags.enabled) return null;

  return (
    <>
      {/* Layer 1: Welcome modal (first login only) */}
      {showWelcome && (
        <OnboardingWelcomeModal
          open
          userName={userName}
          defaultRole={role}
          onStart={(focusArea) => {
            completeWelcome(focusArea);
            // Quick tour fires automatically from hook after welcome
          }}
          onSkip={skipWelcome}
        />
      )}

      {/* Layer 2–3: Tour engine — quick tour then role tour */}
      {showQuickTour && activeTour && (
        <TourOverlay
          tour={activeTour}
          userId={userId}
          role={role}
          onComplete={() => {
            endTour(true);
            // Chain into role tour after quick tour
            if (activeTour.id === "quick_tour") {
              const roleTour = getRoleTour(role);
              if (roleTour) setTimeout(() => startTour(roleTour.id), 400);
            }
          }}
          onSkip={() => endTour(false)}
        />
      )}

      {/* Layer 4: Contextual page hints */}
      {flags.contextHints && currentHintId && !activeTour && !showWelcome && (
        <ContextHintBubble hintId={currentHintId} onDismiss={dismissHint} />
      )}

      {/* Layer 7: What's New */}
      {showWhatsNew && (
        <WhatsNewModal open entries={whatsNewEntries} onDismiss={dismissWhatsNew} />
      )}
    </>
  );
}
