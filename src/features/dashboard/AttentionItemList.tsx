import { useState, type ReactNode } from "react";
import { Stack, Typography } from "@mui/material";

type Props<T> = {
  items: T[];
  maxCollapsed: number;
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  expandedMaxHeight?: number;
};

export default function AttentionItemList<T>({
  items,
  maxCollapsed,
  getKey,
  renderItem,
  expandedMaxHeight = 220,
}: Props<T>) {
  const [expanded, setExpanded] = useState(false);
  const overflow = Math.max(0, items.length - maxCollapsed);
  const visibleItems = expanded ? items : items.slice(0, maxCollapsed);

  return (
    <Stack
      spacing={0.25}
      sx={{
        mt: 1,
        ...(expanded && overflow > 0
          ? {
            maxHeight: expandedMaxHeight,
            overflowY: "auto",
            pr: 0.5,
            // Slim, card-toned scrollbar. The default chrome bar is wide and light, which
            // reads as a foreign element sitting on top of the Needs Attention cards.
            scrollbarWidth: "thin",
            scrollbarColor: "rgba(255,255,255,0.22) transparent",
            "&::-webkit-scrollbar": { width: 6 },
            "&::-webkit-scrollbar-track": { background: "transparent" },
            "&::-webkit-scrollbar-thumb": {
              backgroundColor: "rgba(255,255,255,0.22)",
              borderRadius: 3,
            },
            "&::-webkit-scrollbar-thumb:hover": { backgroundColor: "rgba(255,255,255,0.35)" },
          }
          : {}),
      }}
    >
      {visibleItems.map((item) => (
        <div key={getKey(item)}>{renderItem(item)}</div>
      ))}
      {!expanded && overflow > 0 && (
        <Typography
          variant="caption"
          color="primary"
          sx={{
            pl: 1,
            cursor: "pointer",
            userSelect: "none",
            "&:hover": { textDecoration: "underline" },
          }}
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(true);
          }}
        >
          +{overflow} more
        </Typography>
      )}
    </Stack>
  );
}
