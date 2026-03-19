import { Stack, FormControlLabel, Switch, Chip, Box, Typography } from "@mui/material";
import type { ComparisonState } from "../store/comparisonState";

const ITEM_TYPES = ["asset", "component", "consumable", "reference", "ignore"];

interface Props {
  state: ComparisonState;
  onChange: (patch: Partial<ComparisonState>) => void;
}

export default function ComparisonFilters({ state, onChange }: Props) {
  const toggleItemType = (type: string) => {
    const current = state.filters.itemTypes;
    onChange({
      filters: {
        ...state.filters,
        itemTypes: current.includes(type)
          ? current.filter((t) => t !== type)
          : [...current, type],
      },
    });
  };

  return (
    <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" px={1} py={0.5}
      sx={{ borderBottom: 1, borderColor: "divider", bgcolor: "background.paper" }}>
      <FormControlLabel
        control={
          <Switch
            size="small"
            checked={state.showUnmatchedOnly}
            onChange={(e) => onChange({ showUnmatchedOnly: e.target.checked })}
          />
        }
        label={<Typography variant="caption">Unmatched only</Typography>}
      />
      <FormControlLabel
        control={
          <Switch
            size="small"
            checked={state.showWarningsOnly}
            onChange={(e) => onChange({ showWarningsOnly: e.target.checked })}
          />
        }
        label={<Typography variant="caption">Warnings only</Typography>}
      />
      <FormControlLabel
        control={
          <Switch
            size="small"
            checked={state.showConnections}
            onChange={(e) => onChange({ showConnections: e.target.checked })}
          />
        }
        label={<Typography variant="caption">Show connections</Typography>}
      />
      <Box sx={{ display: "flex", gap: 0.5 }}>
        {ITEM_TYPES.map((t) => (
          <Chip
            key={t}
            label={t}
            size="small"
            variant={state.filters.itemTypes.includes(t) ? "filled" : "outlined"}
            onClick={() => toggleItemType(t)}
            sx={{ cursor: "pointer", textTransform: "capitalize" }}
          />
        ))}
      </Box>
    </Stack>
  );
}
