import { Component, type ErrorInfo, type ReactNode } from "react";
import { Box, Button, CircularProgress, Paper, Stack, Typography } from "@mui/material";
import { ErrorOutlineOutlined, RefreshOutlined, ReportProblemOutlined, SystemUpdateAltOutlined } from "@mui/icons-material";
import { captureFault, generateFaultReferenceCode } from "../services/faultReporting";
import ReportProblemDialog from "../features/support/ReportProblemDialog";
import {
  attemptChunkReload,
  canAttemptChunkReload,
  isStaleChunkError,
} from "../utils/staleChunkError";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  referenceCode: string | null;
  reportOpen: boolean;
  /** Auto-reload in progress after a stale chunk import. */
  staleChunkReloading: boolean;
  /** Reload was already attempted; show the update screen instead of a crash report. */
  staleChunkBlocked: boolean;
}

/**
 * Last line of defence for a render crash. Without this the user gets a blank screen and
 * nothing is recorded; here they get a readable message, a reference code, and a way to say
 * what they were doing. The crash is logged automatically either way.
 *
 * Stale lazy chunks after deploy are handled separately — one guarded reload, no S1 report.
 */
export default class FaultBoundary extends Component<Props, State> {
  state: State = {
    error: null,
    referenceCode: null,
    reportOpen: false,
    staleChunkReloading: false,
    staleChunkBlocked: false,
  };

  static getDerivedStateFromError(error: Error): Partial<State> {
    if (isStaleChunkError(error)) {
      if (canAttemptChunkReload()) {
        return {
          error: null,
          referenceCode: null,
          staleChunkReloading: true,
          staleChunkBlocked: false,
        };
      }
      return {
        error,
        referenceCode: null,
        staleChunkReloading: false,
        staleChunkBlocked: true,
      };
    }

    // Generate the code here so the same one is shown, logged, and attached to any report.
    return {
      error,
      referenceCode: generateFaultReferenceCode(),
      staleChunkReloading: false,
      staleChunkBlocked: false,
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (isStaleChunkError(error)) {
      if (attemptChunkReload()) return;
      if (import.meta.env.DEV) {
        console.warn("[FaultBoundary] stale chunk after reload guard", error, info.componentStack);
      }
      return;
    }

    const componentStack = info.componentStack ?? "";
    void captureFault(error, {
      kind: "crash",
      title: `Screen crashed: ${error.message}`.slice(0, 200),
      referenceCode: this.state.referenceCode ?? undefined,
    });

    if (import.meta.env.DEV) {
      console.error("[FaultBoundary] render crash", error, componentStack);
    }
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    // Full navigation rather than router push — the router may be part of what broke.
    window.location.assign("/");
  };

  render() {
    const { error, referenceCode, reportOpen, staleChunkReloading, staleChunkBlocked } = this.state;

    if (staleChunkReloading) {
      return (
        <Box
          sx={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            p: 2,
            bgcolor: "background.default",
          }}
        >
          <Stack spacing={2} alignItems="center">
            <CircularProgress size={32} />
            <Typography variant="body2" color="text.secondary">
              Loading the latest version…
            </Typography>
          </Stack>
        </Box>
      );
    }

    if (!error) return this.props.children;

    if (staleChunkBlocked) {
      return (
        <Box
          sx={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            p: 2,
            bgcolor: "background.default",
          }}
        >
          <Paper sx={{ p: 4, maxWidth: 520, width: "100%" }}>
            <Stack spacing={2.5} alignItems="flex-start">
              <SystemUpdateAltOutlined color="primary" sx={{ fontSize: 44 }} />

              <Typography variant="h6">A new version is available</Typography>

              <Typography variant="body2" color="text.secondary">
                The app was updated while this tab was open. Reload to pick up the latest
                screens — nothing you already saved has been lost.
              </Typography>

              <Button variant="contained" startIcon={<RefreshOutlined />} onClick={this.handleReload}>
                Reload now
              </Button>
            </Stack>
          </Paper>
        </Box>
      );
    }

    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: 2,
          bgcolor: "background.default",
        }}
      >
        <Paper sx={{ p: 4, maxWidth: 520, width: "100%" }}>
          <Stack spacing={2.5} alignItems="flex-start">
            <ErrorOutlineOutlined color="error" sx={{ fontSize: 44 }} />

            <Typography variant="h6">This screen ran into a problem</Typography>

            <Typography variant="body2" color="text.secondary">
              Nothing you had already saved has been lost. We've logged what happened
              automatically. Reloading usually clears it.
            </Typography>

            {referenceCode && (
              <Box>
                <Typography variant="caption" color="text.secondary" display="block">
                  Reference
                </Typography>
                <Typography sx={{ fontFamily: "monospace", letterSpacing: 1 }}>
                  {referenceCode}
                </Typography>
              </Box>
            )}

            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Button variant="contained" startIcon={<RefreshOutlined />} onClick={this.handleReload}>
                Reload
              </Button>
              <Button onClick={this.handleGoHome}>Go to dashboard</Button>
              <Button
                startIcon={<ReportProblemOutlined />}
                onClick={() => this.setState({ reportOpen: true })}
              >
                Tell us what happened
              </Button>
            </Stack>

            {import.meta.env.DEV && (
              <Box
                component="pre"
                sx={{
                  mt: 1,
                  p: 1.5,
                  width: "100%",
                  overflow: "auto",
                  maxHeight: 220,
                  bgcolor: "action.hover",
                  borderRadius: 1,
                  fontSize: 12,
                }}
              >
                {error.stack ?? error.message}
              </Box>
            )}
          </Stack>
        </Paper>

        <ReportProblemDialog
          open={reportOpen}
          onClose={() => this.setState({ reportOpen: false })}
          initialTitle={`Screen crashed: ${error.message}`.slice(0, 200)}
          referenceCode={referenceCode ?? undefined}
        />
      </Box>
    );
  }
}
