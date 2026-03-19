import { useState } from "react";
import {
  Box, Tabs, Tab, Typography, Table, TableBody, TableCell,
  TableHead, TableRow, Paper, Chip, Stack, Accordion,
  AccordionSummary, AccordionDetails,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import type { DraftProject, DraftAsset, DraftComponent } from "../types/projectDraft";
import type { ValidationResult } from "../types/validation";
import type { CenterTab } from "../store/comparisonState";
import AssetPreviewCard from "./AssetPreviewCard";
import ValidationPanel from "./ValidationPanel";

interface Props {
  draft: DraftProject;
  validationResult?: ValidationResult;
  activeTab: CenterTab;
  onTabChange: (tab: CenterTab) => void;
  selectedGeneratedNodeId?: string;
  onNodeClick?: (id: string) => void;
}

export default function GeneratedOutputPanel({
  draft,
  validationResult,
  activeTab,
  onTabChange,
  selectedGeneratedNodeId,
  onNodeClick,
}: Props) {
  const tabs: { value: CenterTab; label: string }[] = [
    { value: "overview", label: "Overview" },
    { value: "assets", label: `Assets (${draft.assets.length})` },
    { value: "components", label: "Components" },
    { value: "features", label: "Features" },
    { value: "inventory", label: "Inventory" },
    { value: "capture", label: "Capture Fields" },
    { value: "workflow", label: "Workflow" },
    { value: "issues", label: `Issues${validationResult ? ` (${validationResult.errors.length + validationResult.warnings.length})` : ""}` },
  ];

  const totalComponents = draft.assets.reduce((s, a) => s + a.components.length, 0);
  const totalShortages = draft.assets.reduce(
    (s, a) => s + a.components.filter((c) => c.differenceQty !== undefined && c.differenceQty < 0).length,
    0
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Typography variant="subtitle2" fontWeight={600} mb={1}>
        Generated Output — {draft.projectName}
      </Typography>

      <Tabs
        value={activeTab}
        onChange={(_, v) => onTabChange(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ borderBottom: 1, borderColor: "divider", mb: 1 }}
      >
        {tabs.map((t) => (
          <Tab key={t.value} value={t.value} label={t.label} sx={{ fontSize: "0.75rem", minHeight: 36, py: 0.5 }} />
        ))}
      </Tabs>

      <Box sx={{ flex: 1, overflow: "auto" }}>
        {activeTab === "overview" && (
          <Stack spacing={1}>
            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Stack direction="row" spacing={3}>
                <Box><Typography variant="h5" fontWeight={700}>{draft.assets.length}</Typography><Typography variant="caption">Assets</Typography></Box>
                <Box><Typography variant="h5" fontWeight={700}>{totalComponents}</Typography><Typography variant="caption">Components</Typography></Box>
                <Box>
                  <Typography variant="h5" fontWeight={700} color={totalShortages > 0 ? "warning.main" : "inherit"}>
                    {totalShortages}
                  </Typography>
                  <Typography variant="caption">Shortages</Typography>
                </Box>
              </Stack>
            </Paper>
            <Box display="grid" gridTemplateColumns="1fr 1fr" gap={1}>
              {draft.assets.slice(0, 6).map((a) => (
                <AssetPreviewCard
                  key={a.draftAssetId}
                  asset={a}
                  selected={selectedGeneratedNodeId === a.draftAssetId}
                  onClick={() => onNodeClick?.(a.draftAssetId)}
                />
              ))}
            </Box>
          </Stack>
        )}

        {activeTab === "assets" && (
          <Stack spacing={1}>
            {draft.assets.map((a) => (
              <AssetPreviewCard
                key={a.draftAssetId}
                asset={a}
                selected={selectedGeneratedNodeId === a.draftAssetId}
                onClick={() => onNodeClick?.(a.draftAssetId)}
              />
            ))}
          </Stack>
        )}

        {activeTab === "components" && (
          <Stack spacing={1}>
            {draft.assets.map((asset) => (
              <Accordion key={asset.draftAssetId} defaultExpanded>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography fontWeight={600}>{asset.assetName}</Typography>
                  <Chip label={`${asset.components.length} parts`} size="small" sx={{ ml: 1 }} />
                </AccordionSummary>
                <AccordionDetails sx={{ p: 0 }}>
                  <ComponentTable components={asset.components} />
                </AccordionDetails>
              </Accordion>
            ))}
          </Stack>
        )}

        {activeTab === "inventory" && (
          <Paper variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Part No.</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell align="right">Required</TableCell>
                  <TableCell align="right">Stock</TableCell>
                  <TableCell align="right">Diff</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {draft.assets.flatMap((a) =>
                  a.components.filter((c) => c.inventoryTracked).map((c) => {
                    const shortage = c.differenceQty !== undefined && c.differenceQty < 0;
                    return (
                      <TableRow key={c.draftComponentId}>
                        <TableCell><Typography variant="caption" fontFamily="monospace">{c.partNumber ?? "—"}</Typography></TableCell>
                        <TableCell><Typography variant="caption">{c.description}</Typography></TableCell>
                        <TableCell align="right"><Typography variant="caption">{c.qtyRequired}</Typography></TableCell>
                        <TableCell align="right"><Typography variant="caption">{c.stockQty ?? "—"}</Typography></TableCell>
                        <TableCell align="right">
                          <Typography variant="caption" color={shortage ? "warning.main" : "success.main"}>
                            {c.differenceQty !== undefined ? c.differenceQty : "—"}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={shortage ? "Shortage" : "OK"}
                            color={shortage ? "warning" : "success"}
                            size="small"
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Paper>
        )}

        {activeTab === "features" && (
          <Stack spacing={1}>
            {draft.assets.map((asset) =>
              asset.features.map((f) => (
                <Paper key={f.draftFeatureId} variant="outlined" sx={{ p: 1.5 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Box>
                      <Typography variant="body2" fontWeight={600}>{f.featureName}</Typography>
                      <Typography variant="caption" color="text.secondary">{asset.assetName}</Typography>
                    </Box>
                    <Stack direction="row" spacing={0.5}>
                      {f.testRequired && <Chip label="Test" size="small" color="primary" />}
                      {f.photoRequired && <Chip label="Photo" size="small" color="secondary" />}
                      {f.configurable && <Chip label="Config" size="small" />}
                    </Stack>
                  </Stack>
                </Paper>
              ))
            )}
          </Stack>
        )}

        {activeTab === "issues" && validationResult && (
          <ValidationPanel result={validationResult} />
        )}

        {(activeTab === "capture" || activeTab === "workflow" || activeTab === "dependencies") && (
          <Box p={2} color="text.secondary">
            <Typography variant="body2">Select an asset to view {activeTab} details.</Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}

function ComponentTable({ components }: { components: DraftComponent[] }) {
  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Part No.</TableCell>
          <TableCell>Description</TableCell>
          <TableCell align="right">Qty</TableCell>
          <TableCell>Type</TableCell>
          <TableCell>Inventory</TableCell>
          <TableCell>Serial</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {components.map((c) => (
          <TableRow key={c.draftComponentId}>
            <TableCell><Typography variant="caption" fontFamily="monospace">{c.partNumber ?? "—"}</Typography></TableCell>
            <TableCell><Typography variant="caption">{c.description}</Typography></TableCell>
            <TableCell align="right"><Typography variant="caption">{c.qtyRequired}</Typography></TableCell>
            <TableCell><Chip label={c.itemType} size="small" variant="outlined" /></TableCell>
            <TableCell><Chip label={c.inventoryTracked ? "Yes" : "No"} size="small" color={c.inventoryTracked ? "success" : "default"} /></TableCell>
            <TableCell><Chip label={c.serialRequired ? "Yes" : "No"} size="small" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
