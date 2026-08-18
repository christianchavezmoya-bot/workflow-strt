import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Typography } from "@mui/material";

const ITEM_HEIGHT = 44;
const VISIBLE_ROWS = 5;
/** How many spacer rows above/below so first/last can sit in the lens. */
const PAD_ROWS = 2;

interface Props {
  options: string[];
  value: string;
  onChange: (next: string) => void;
  error?: boolean;
}

/**
 * iOS-style vertical wheel: fixed centre lens, fade/scale for neighbours,
 * soft 3D tilt. Scroll-snap keeps one option locked under the magnifier.
 */
export default function WheelPicker({ options, value, onChange, error = false }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const selectedIndex = Math.max(0, options.indexOf(value));
  const syncingRef = useRef(false);

  const syncFromScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const top = el.scrollTop;
    setScrollTop(top);
    const idx = Math.round(top / ITEM_HEIGHT);
    const clamped = options[Math.min(Math.max(idx, 0), options.length - 1)];
    if (clamped !== undefined && clamped !== value) onChange(clamped);
  }, [onChange, options, value]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = selectedIndex * ITEM_HEIGHT;
    if (Math.abs(el.scrollTop - target) > 1) {
      syncingRef.current = true;
      el.scrollTop = target;
      setScrollTop(target);
      requestAnimationFrame(() => {
        syncingRef.current = false;
      });
    }
  }, [selectedIndex, options.length]);

  if (options.length === 0) {
    return (
      <Typography variant="caption" color="text.secondary">
        No options configured for this field.
      </Typography>
    );
  }

  const viewportHeight = ITEM_HEIGHT * VISIBLE_ROWS;

  return (
    <Box
      sx={{
        position: "relative",
        width: 260,
        maxWidth: "100%",
        height: viewportHeight,
        borderRadius: 2.5,
        border: "1px solid",
        borderColor: error ? "error.main" : "rgba(148, 163, 184, 0.35)",
        bgcolor: "rgba(15, 23, 42, 0.55)",
        boxShadow: "inset 0 12px 18px rgba(0,0,0,0.28), inset 0 -12px 18px rgba(0,0,0,0.28)",
        overflow: "hidden",
        userSelect: "none",
        touchAction: "pan-y",
        perspective: "900px",
      }}
    >
      {/* Centre magnifying lens */}
      <Box
        aria-hidden
        sx={{
          pointerEvents: "none",
          position: "absolute",
          left: 8,
          right: 8,
          top: "50%",
          height: ITEM_HEIGHT,
          mt: `${-ITEM_HEIGHT / 2}px`,
          borderRadius: 1.5,
          border: "1px solid rgba(45, 212, 191, 0.45)",
          background:
            "linear-gradient(180deg, rgba(45,212,191,0.14), rgba(45,212,191,0.06) 40%, rgba(45,212,191,0.14))",
          boxShadow: "0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.18)",
          zIndex: 2,
        }}
      />

      {/* Top / bottom fade masks */}
      <Box
        aria-hidden
        sx={{
          pointerEvents: "none",
          position: "absolute",
          inset: 0,
          zIndex: 3,
          background:
            "linear-gradient(180deg, rgba(15,23,42,0.92) 0%, rgba(15,23,42,0.35) 28%, transparent 42%, transparent 58%, rgba(15,23,42,0.35) 72%, rgba(15,23,42,0.92) 100%)",
        }}
      />

      <Box
        ref={ref}
        onScroll={() => {
          if (syncingRef.current) return;
          syncFromScroll();
        }}
        sx={{
          position: "relative",
          zIndex: 1,
          height: "100%",
          overflowY: "auto",
          scrollSnapType: "y mandatory",
          WebkitOverflowScrolling: "touch",
          "&::-webkit-scrollbar": { display: "none" },
          scrollbarWidth: "none",
        }}
      >
        <Box sx={{ height: ITEM_HEIGHT * PAD_ROWS }} />
        {options.map((opt, idx) => {
          const offset = (idx * ITEM_HEIGHT - scrollTop) / ITEM_HEIGHT;
          const abs = Math.abs(offset);
          const opacity = Math.max(0.18, 1 - abs * 0.38);
          const scale = Math.max(0.72, 1 - abs * 0.14);
          const rotateX = Math.max(-55, Math.min(55, offset * 22));
          const selected = abs < 0.45;

          return (
            <Box
              key={`${opt}-${idx}`}
              onClick={() => {
                onChange(opt);
                const el = ref.current;
                if (el) el.scrollTo({ top: idx * ITEM_HEIGHT, behavior: "smooth" });
              }}
              sx={{
                height: ITEM_HEIGHT,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                scrollSnapAlign: "center",
                cursor: "pointer",
                transformOrigin: "center center",
                transform: `translateZ(0) rotateX(${rotateX}deg) scale(${scale})`,
                opacity,
                transition: "opacity 60ms linear, transform 60ms linear",
              }}
            >
              <Typography
                variant="body2"
                noWrap
                sx={{
                  px: 1.5,
                  maxWidth: "100%",
                  fontWeight: selected ? 700 : 500,
                  fontSize: selected ? "1.05rem" : "0.92rem",
                  letterSpacing: selected ? 0.2 : 0,
                  color: selected ? "common.white" : "text.secondary",
                  textShadow: selected ? "0 1px 8px rgba(45,212,191,0.35)" : "none",
                }}
              >
                {opt}
              </Typography>
            </Box>
          );
        })}
        <Box sx={{ height: ITEM_HEIGHT * PAD_ROWS }} />
      </Box>
    </Box>
  );
}
