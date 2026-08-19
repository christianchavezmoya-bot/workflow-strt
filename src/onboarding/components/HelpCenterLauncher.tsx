import {
  Box, Button, Divider, Drawer, IconButton, Stack, Typography,
} from "@mui/material";
import HelpOutlineOutlinedIcon from "@mui/icons-material/HelpOutlineOutlined";
import ReplayOutlinedIcon from "@mui/icons-material/ReplayOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import { useEffect } from "react";
import type { OnboardingControls } from "../hooks/useOnboarding";

interface Props {
  controls: OnboardingControls;
}

export default function HelpCenterLauncher({ controls }: Props) {
  const { helpOpen, openHelp, closeHelp, replayTour, resetOnboarding, flags } = controls;

  useEffect(() => {
    const handler = () => openHelp();
    window.addEventListener("open-help-drawer", handler);
    return () => window.removeEventListener("open-help-drawer", handler);
  }, [openHelp]);

  return (
    <>
      {/* Help drawer */}
      <Drawer
        anchor="right"
        open={helpOpen}
        onClose={closeHelp}
        PaperProps={{ sx: { width: 300, p: 2.5, borderRadius: "12px 0 0 12px" } }}
      >
        <Stack spacing={2.5} height="100%">
          {/* Header */}
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Stack direction="row" spacing={1} alignItems="center">
              <HelpOutlineOutlinedIcon color="primary" fontSize="small" />
              <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora" }}>
                Help & Tours
              </Typography>
            </Stack>
            <IconButton size="small" onClick={closeHelp}>
              <CloseOutlinedIcon fontSize="small" />
            </IconButton>
          </Stack>

          <Divider />

          {/* Tours */}
          <Box>
            <Typography variant="caption" fontWeight={700} color="text.secondary"
              sx={{ textTransform: "uppercase", letterSpacing: 0.8 }} display="block" mb={1.5}>
              Tours
            </Typography>
            <Stack spacing={1}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<ReplayOutlinedIcon />}
                onClick={() => replayTour("quick_tour")}
                sx={{ justifyContent: "flex-start" }}
              >
                Replay quick tour
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<ReplayOutlinedIcon />}
                onClick={() => replayTour("role_tour")}
                sx={{ justifyContent: "flex-start" }}
              >
                Replay role tour
              </Button>
            </Stack>
          </Box>

          <Divider />

          {/* What's New */}
          <Box>
            <Typography variant="caption" fontWeight={700} color="text.secondary"
              sx={{ textTransform: "uppercase", letterSpacing: 0.8 }} display="block" mb={1.5}>
              Release notes
            </Typography>
            <Button
              variant="outlined"
              size="small"
              startIcon={<AutoAwesomeOutlinedIcon />}
              onClick={() => { closeHelp(); controls.openWhatsNew(); }}
              sx={{ justifyContent: "flex-start" }}
            >
              View What's New
            </Button>
          </Box>

          {/* Debug section */}
          {flags.debugMode && (
            <>
              <Divider />
              <Box>
                <Typography variant="caption" fontWeight={700} color="warning.main"
                  sx={{ textTransform: "uppercase", letterSpacing: 0.8 }} display="block" mb={1.5}>
                  Debug
                </Typography>
                <Button
                  variant="outlined"
                  color="warning"
                  size="small"
                  startIcon={<DeleteOutlineOutlinedIcon />}
                  onClick={() => { resetOnboarding(); closeHelp(); }}
                  sx={{ justifyContent: "flex-start" }}
                >
                  Reset onboarding state
                </Button>
              </Box>
            </>
          )}

          <Box flex={1} />
          <Typography variant="caption" color="text.disabled" textAlign="center">
            Press Esc to close tours · Use arrows to navigate
          </Typography>
        </Stack>
      </Drawer>
    </>
  );
}
