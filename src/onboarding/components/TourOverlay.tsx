/**
 * TourOverlay — spotlight + tooltip tour engine.
 * Uses SVG mask to cut a hole over the target element.
 * Tooltip card is positioned adjacent to the target.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Button, IconButton, Paper, Stack, Tooltip, Typography } from "@mui/material";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import type { TourDefinition, TourStep } from "../types/onboarding.types";
import { onboardingAnalytics } from "../services/onboardingAnalytics";

interface TargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const PADDING = 10;
const TOOLTIP_W = 300;

function getRect(selector: string): TargetRect | null {
  const el = document.querySelector(`[data-tour="${selector}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

function tooltipPosition(rect: TargetRect | null, placement: TourStep["placement"], vpW: number, vpH: number) {
  if (!rect || placement === "center") {
    return { top: "50%", left: "50%", transform: "translate(-50%,-50%)" };
  }
  const gap = PADDING + 12;
  switch (placement) {
    case "right": return {
      top: Math.max(8, Math.min(rect.y, vpH - 200)),
      left: Math.min(rect.x + rect.width + gap, vpW - TOOLTIP_W - 8),
    };
    case "left": return {
      top: Math.max(8, Math.min(rect.y, vpH - 200)),
      left: Math.max(8, rect.x - TOOLTIP_W - gap),
    };
    case "bottom": return {
      top: rect.y + rect.height + gap,
      left: Math.min(Math.max(8, rect.x), vpW - TOOLTIP_W - 8),
    };
    case "top":
    default: return {
      top: Math.max(8, rect.y - 180 - gap),
      left: Math.min(Math.max(8, rect.x), vpW - TOOLTIP_W - 8),
    };
  }
}

interface Props {
  tour: TourDefinition;
  userId?: string;
  role?: string;
  onComplete: () => void;
  onSkip: () => void;
}

export default function TourOverlay({ tour, userId, role, onComplete, onSkip }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<TargetRect | null>(null);
  const [vpW, setVpW] = useState(window.innerWidth);
  const [vpH, setVpH] = useState(window.innerHeight);
  const rafRef = useRef<number | null>(null);

  const steps = tour.steps.slice().sort((a, b) => a.order - b.order);
  const step = steps[stepIndex];

  const updateRect = useCallback(() => {
    if (step?.targetSelector) {
      setRect(getRect(step.targetSelector));
    } else {
      setRect(null);
    }
    setVpW(window.innerWidth);
    setVpH(window.innerHeight);
  }, [step?.targetSelector]);

  // Observe layout shifts
  useEffect(() => {
    updateRect();
    const onResize = () => updateRect();
    window.addEventListener("resize", onResize);
    // Poll a few times to handle lazy renders
    let ticks = 0;
    const poll = () => {
      updateRect();
      if (++ticks < 5) rafRef.current = requestAnimationFrame(poll);
    };
    rafRef.current = requestAnimationFrame(poll);
    return () => {
      window.removeEventListener("resize", onResize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [updateRect]);

  // Keyboard support
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onSkip();
      if (e.key === "ArrowRight" || e.key === "Enter") handleNext();
      if (e.key === "ArrowLeft") handleBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  // Analytics
  useEffect(() => {
    onboardingAnalytics.emit("tour_step_viewed", {
      userId, role, tourId: tour.id, stepId: step?.id, stepIndex,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  function handleNext() {
    if (stepIndex < steps.length - 1) {
      setStepIndex((i) => i + 1);
    } else {
      onComplete();
    }
  }

  function handleBack() {
    if (stepIndex > 0) setStepIndex((i) => i - 1);
  }

  if (!step) return null;

  // Build SVG spotlight cutout
  const rx = rect ? Math.max(0, rect.x - PADDING) : 0;
  const ry = rect ? Math.max(0, rect.y - PADDING) : 0;
  const rw = rect ? rect.width + PADDING * 2 : 0;
  const rh = rect ? rect.height + PADDING * 2 : 0;
  const hasTarget = !!rect && rw > 0;

  const tooltipPos = tooltipPosition(rect, step.placement, vpW, vpH);
  const isLast = stepIndex === steps.length - 1;

  return (
    <Box
      sx={{
        position: "fixed",
        inset: 0,
        zIndex: 1400,
        "@media (prefers-reduced-motion: reduce)": { transition: "none" },
      }}
      role="dialog"
      aria-modal="true"
      aria-label={step.title}
    >
      {/* SVG spotlight overlay */}
      <Box
        component="svg"
        sx={{ position: "fixed", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
        viewBox={`0 0 ${vpW} ${vpH}`}
        preserveAspectRatio="none"
      >
        <defs>
          <mask id="ob-spotlight-mask">
            <rect width={vpW} height={vpH} fill="white" />
            {hasTarget && (
              <rect x={rx} y={ry} width={rw} height={rh} rx={8} fill="black" />
            )}
          </mask>
        </defs>
        <rect width={vpW} height={vpH} fill="rgba(0,0,0,0.62)" mask="url(#ob-spotlight-mask)" />
      </Box>

      {/* Highlight border around target */}
      {hasTarget && (
        <Box
          sx={{
            position: "fixed",
            top: ry,
            left: rx,
            width: rw,
            height: rh,
            borderRadius: 1,
            border: "2px solid",
            borderColor: "primary.main",
            boxShadow: "0 0 0 3px rgba(99,102,241,0.25)",
            pointerEvents: "none",
            transition: "all 0.25s ease",
          }}
        />
      )}

      {/* Tooltip card */}
      <Paper
        elevation={8}
        sx={{
          position: "fixed",
          width: TOOLTIP_W,
          borderRadius: 2,
          p: 2.5,
          zIndex: 1401,
          ...tooltipPos,
        }}
      >
        <Stack spacing={1.5}>
          {/* Header */}
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
            <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora", lineHeight: 1.2 }}>
              {step.title}
            </Typography>
            <Tooltip title="Skip tour (Esc)">
              <IconButton size="small" onClick={onSkip} sx={{ mt: -0.5, mr: -0.5 }}>
                <CloseOutlinedIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          </Stack>

          {/* Body */}
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.55 }}>
            {step.body}
          </Typography>

          {/* Progress dots */}
          <Stack direction="row" spacing={0.5} justifyContent="center">
            {steps.map((_, i) => (
              <Box
                key={i}
                sx={{
                  width: i === stepIndex ? 18 : 7,
                  height: 7,
                  borderRadius: 4,
                  bgcolor: i === stepIndex ? "primary.main" : "divider",
                  transition: "width 0.2s ease, background-color 0.2s ease",
                }}
              />
            ))}
          </Stack>

          {/* Navigation */}
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Button
              size="small"
              variant="text"
              color="inherit"
              onClick={handleBack}
              disabled={stepIndex === 0}
              sx={{ color: "text.secondary", minWidth: 60 }}
            >
              Back
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={handleNext}
            >
              {isLast ? "Done" : "Next →"}
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Box>
  );
}
