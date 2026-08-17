import {
  Box,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
/** Minimal shape for inventory feature rows (matches page FeatureDef). */
export type InventoryFeatureRow = {
  id: string;
  name: string;
  valueType: string;
  subProperties?: { id: string; name: string }[];
};

type Props = {
  featureValuesJson: string | null | undefined;
  inventoryFeatures: InventoryFeatureRow[];
};

export default function AssetInstallationFeatureExpandedRow({
  featureValuesJson,
  inventoryFeatures,
}: Props) {
  let fv: Record<string, string> = {};
  try {
    fv = JSON.parse(featureValuesJson || "{}");
  } catch {
    fv = {};
  }

  if (inventoryFeatures.length === 0) {
    const entries = Object.entries(fv);
    if (!entries.length) {
      return (
        <Typography variant="caption" color="text.secondary">
          No inventory feature data recorded.
        </Typography>
      );
    }
    return (
      <Stack spacing={0.5}>
        {entries.map(([k, v]) => (
          <Stack key={k} direction="row" spacing={2}>
            <Typography variant="caption" color="text.secondary" sx={{ minWidth: 120 }}>
              {k.slice(0, 20)}
            </Typography>
            <Typography variant="caption">{v}</Typography>
          </Stack>
        ))}
      </Stack>
    );
  }

  return (
    <Table size="small" sx={{ maxWidth: 680, minWidth: 650 }}>
      <TableHead>
        <TableRow sx={{ bgcolor: "rgba(255,255,255,0.06)" }}>
          <TableCell sx={{ fontWeight: 700, fontSize: 12, py: 0.75, width: "35%", color: "text.primary" }}>
            Feature
          </TableCell>
          <TableCell sx={{ fontWeight: 700, fontSize: 12, py: 0.75, color: "text.primary" }}>Value</TableCell>
          <TableCell sx={{ fontWeight: 700, fontSize: 12, py: 0.75, width: 60, color: "text.primary" }}>
            Status
          </TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {inventoryFeatures.flatMap((feat) => {
          const raw = fv[feat.id];
          const isComponent = feat.valueType === "component" && (feat.subProperties ?? []).length > 0;
          let displayVal = "-";
          let filled = !!raw;

          if (raw && isComponent) {
            try {
              const sub: Record<string, string> = JSON.parse(raw);
              const parts = (feat.subProperties ?? [])
                .map((sp) => (sub[sp.id] ? `${sp.name}: ${sub[sp.id]}` : null))
                .filter(Boolean);
              displayVal = parts.length ? `${parts.length} sub-field${parts.length !== 1 ? "s" : ""} filled` : "-";
              filled = parts.length > 0;
            } catch {
              filled = false;
            }
          } else if (raw) {
            displayVal = raw;
          }

          const parentRow = (
            <TableRow key={feat.id}>
              <TableCell sx={{ fontSize: 13, fontWeight: 600, py: 0.75, color: "text.primary" }}>
                {feat.name}
              </TableCell>
              <TableCell
                sx={{
                  fontSize: 13,
                  py: 0.75,
                  color: filled ? "text.primary" : "text.secondary",
                  fontStyle: filled ? "normal" : "italic",
                }}
              >
                {isComponent ? displayVal : filled ? displayVal : "Not filled"}
              </TableCell>
              <TableCell sx={{ py: 0.75 }}>
                <Box
                  sx={{
                    width: 9,
                    height: 9,
                    borderRadius: "50%",
                    bgcolor: filled ? "success.main" : "grey.300",
                  }}
                />
              </TableCell>
            </TableRow>
          );

          const subRows =
            isComponent && raw
              ? (() => {
                  try {
                    const sub: Record<string, string> = JSON.parse(raw);
                    return (feat.subProperties ?? []).map((sp) => (
                      <TableRow key={`${feat.id}-${sp.id}`} sx={{ bgcolor: "rgba(255,255,255,0.03)" }}>
                        <TableCell sx={{ fontSize: 12, pl: 3.5, color: "text.secondary", py: 0.5 }}>
                          {"->"} {sp.name}
                        </TableCell>
                        <TableCell sx={{ fontSize: 12, py: 0.5 }}>{sub[sp.id] || "-"}</TableCell>
                        <TableCell sx={{ py: 0.5 }}>
                          <Box
                            sx={{
                              width: 7,
                              height: 7,
                              borderRadius: "50%",
                              bgcolor: sub[sp.id] ? "success.main" : "grey.300",
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    ));
                  } catch {
                    return [];
                  }
                })()
              : [];

          return [parentRow, ...subRows];
        })}
      </TableBody>
    </Table>
  );
}
