import { useEffect, useRef } from "react";
import { Box, Typography } from "@mui/material";

const ITEM_HEIGHT = 36;

interface Props {
  options: string[];
  value: string;
  onChange: (next: string) => void;
  error?: boolean;
}

/**
 * Vertical scroll wheel for picking one value from an arbitrary option list —
 * the same scroll-snap interaction as TimeWheelPicker, generalized beyond
 * fixed time steps. Better than the "choice" toggle-button row once a step
 * has more than ~5 options (those wrap into an unreadable multi-row block).
 */
export default function WheelPicker({ options, value, onChange, error = false }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const selectedIndex = Math.max(0, options.indexOf(value));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = selectedIndex * ITEM_HEIGHT;
  }, [selectedIndex]);

  if (options.length === 0) {
    return (
      <Typography variant="caption" color="text.secondary">
        No options configured for this field.
      </Typography>
    );
  }

  return (
    <Box
      ref={ref}
      onScroll={() => {
        const el = ref.current;
        if (!el) return;
        const idx = Math.round(el.scrollTop / ITEM_HEIGHT);
        const clamped = options[Math.min(Math.max(idx, 0), options.length - 1)];
        if (clamped !== undefined && clamped !== value) onChange(clamped);
      }}
      sx={{
        width: 220,
        maxWidth: "100%",
        height: ITEM_HEIGHT * 5,
        overflowY: "auto",
        scrollSnapType: "y mandatory",
        border: "1px solid",
        borderColor: error ? "error.main" : "divider",
        borderRadius: 1,
        bgcolor: "background.default",
        "&::-webkit-scrollbar": { width: 4 },
      }}
    >
      <Box sx={{ height: ITEM_HEIGHT * 2 }} />
      {options.map((opt, idx) => (
        <Box
          key={`${opt}-${idx}`}
          onClick={() => onChange(opt)}
          sx={{
            height: ITEM_HEIGHT,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            scrollSnapAlign: "center",
            cursor: "pointer",
            bgcolor: opt === value ? "action.selected" : "transparent",
            borderRadius: 1,
          }}
        >
          <Typography
            variant="body2"
            fontWeight={opt === value ? 700 : 400}
            noWrap
            sx={{ px: 1, maxWidth: "100%" }}
          >
            {opt}
          </Typography>
        </Box>
      ))}
      <Box sx={{ height: ITEM_HEIGHT * 2 }} />
    </Box>
  );
}
