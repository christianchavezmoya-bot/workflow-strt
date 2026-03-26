import {
  Box, Button, Dialog, DialogContent, Stack, Typography, ToggleButton,
  ToggleButtonGroup, Chip,
} from "@mui/material";
import { useState } from "react";
import type { FocusArea } from "../types/onboarding.types";

interface Props {
  open: boolean;
  userName?: string;
  defaultRole?: string;
  onStart: (focusArea: FocusArea) => void;
  onSkip: () => void;
}

const FOCUS_OPTIONS: { value: FocusArea; label: string; desc: string }[] = [
  { value: "build_workflows",    label: "Build workflows",        desc: "Templates & instructions" },
  { value: "manage_projects",    label: "Manage projects",        desc: "Projects, assets & teams" },
  { value: "run_field_jobs",     label: "Run field jobs",         desc: "Complete assigned work" },
  { value: "inspections",        label: "Inspections",            desc: "Record findings & reports" },
  { value: "reports_review",     label: "Review & reports",       desc: "Read-only access & exports" },
];

function roleToFocusArea(role: string): FocusArea {
  const r = role.toLowerCase();
  if (r.includes("admin")) return "build_workflows";
  if (r.includes("manager")) return "manage_projects";
  if (r.includes("engineer") || r.includes("installer") || r.includes("tech")) return "run_field_jobs";
  if (r.includes("inspector")) return "inspections";
  return "reports_review";
}

export default function OnboardingWelcomeModal({ open, userName, defaultRole = "", onStart, onSkip }: Props) {
  const [focus, setFocus] = useState<FocusArea>(roleToFocusArea(defaultRole));

  return (
    <Dialog
      open={open}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3, p: 1 } }}
      // prevent accidental backdrop close
      onClose={() => {}}
    >
      <DialogContent sx={{ overflowY: "auto", maxHeight: "80vh" }}>
        <Stack spacing={3}>
          {/* Header */}
          <Box>
            <Stack direction="row" alignItems="center" spacing={1.5} mb={1}>
              <Typography variant="h5" sx={{ fontFamily: "Sora", fontWeight: 700 }}>
                Welcome{userName ? `, ${userName.split(" ")[0]}` : ""}
              </Typography>
              <Chip label="Quick setup" size="small" color="primary" sx={{ fontSize: 11 }} />
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Takes about 60 seconds. We'll show only what matters for your work.
            </Typography>
          </Box>

          {/* Focus area selector */}
          <Box>
            <Typography variant="caption" fontWeight={700} color="text.secondary"
              sx={{ textTransform: "uppercase", letterSpacing: 0.8 }} display="block" mb={1.25}>
              What do you mainly do in this app?
            </Typography>
            <ToggleButtonGroup
              value={focus}
              exclusive
              onChange={(_, v) => { if (v) setFocus(v as FocusArea); }}
              orientation="vertical"
              sx={{ width: "100%", gap: 0.75 }}
            >
              {FOCUS_OPTIONS.map((opt) => (
                <ToggleButton
                  key={opt.value}
                  value={opt.value}
                  sx={{
                    justifyContent: "flex-start",
                    borderRadius: "8px !important",
                    border: "1px solid",
                    borderColor: "divider",
                    px: 2,
                    py: 1.25,
                    textAlign: "left",
                    "&.Mui-selected": {
                      borderColor: "primary.main",
                      bgcolor: "primary.main",
                      color: "primary.contrastText",
                      "&:hover": { bgcolor: "primary.dark" },
                    },
                  }}
                >
                  <Stack>
                    <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.3 }}>
                      {opt.label}
                    </Typography>
                    <Typography variant="caption" sx={{ opacity: 0.75 }}>
                      {opt.desc}
                    </Typography>
                  </Stack>
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>

          {/* Actions */}
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Button variant="text" size="small" color="inherit" onClick={onSkip}
              sx={{ color: "text.disabled" }}>
              Skip for now
            </Button>
            <Button variant="contained" size="large" onClick={() => onStart(focus)}>
              Start quick tour →
            </Button>
          </Stack>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
