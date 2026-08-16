import { Component, type ErrorInfo, type ReactNode } from "react";
import { Box, Button, Paper, Stack, Typography } from "@mui/material";
import { ErrorOutlineOutlined, RefreshOutlined, ReportProblemOutlined } from "@mui/icons-material";
import { captureFault, generateFaultReferenceCode } from "../services/faultReporting";
import ReportProblemDialog from "../features/support/ReportProblemDialog";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  referenceCode: string | null;
  reportOpen: boolean;
}

/**
 * Last line of defence for a render crash. Without this the user gets a blank screen and
 * nothing is recorded; here they get a readable message, a reference code, and a way to say
 * what they were doing. The crash is logged automatically either way.
 */
export default class FaultBoundary extends Component<Props, State> {
  state: State = { error: null, referenceCode: null, reportOpen: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Generate the code here so the same one is shown, logged, and attached to any report.
    return { error, referenceCode: generateFaultReferenceCode() };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
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
    const { error, referenceCode, reportOpen } = this.state;
    if (!error) return this.props.children;

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
