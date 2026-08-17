import { PhotoCameraOutlined } from "@mui/icons-material";
import { Box, Button, Chip, Stack, Typography } from "@mui/material";
import { randomId } from "../../utils/randomId";
import { fmtDate } from "./dashboardPageLogic";
import type { MissingMediaFlag } from "./photoUploadTypes";

const STORAGE_KEY = "pm_missing_media_flags";
const REMINDER_STORAGE_KEY = "installer_photo_reminders";

type Props = {
  variant: "installer" | "pm";
  flags: MissingMediaFlag[];
  onFlagsChange: (flags: MissingMediaFlag[]) => void;
  technicianUserId?: string;
  onUploadPhotos?: (flag: MissingMediaFlag) => void;
  onOpenRepair?: (flag: MissingMediaFlag) => void;
  reminderSentId?: string | null;
  onReminderSent?: (flagId: string) => void;
  sentByName?: string;
};

export default function DashboardMissingMediaFlagsSection({
  variant,
  flags,
  onFlagsChange,
  technicianUserId,
  onUploadPhotos,
  onOpenRepair,
  reminderSentId,
  onReminderSent,
  sentByName = "PM",
}: Props) {
  const visibleFlags =
    variant === "installer" && technicianUserId
      ? flags.filter((flag) => flag.technicianUserId === technicianUserId)
      : flags;

  if (visibleFlags.length === 0) return null;

  function dismissAll() {
    localStorage.removeItem(STORAGE_KEY);
    onFlagsChange([]);
  }

  function dismissOne(flagId: string) {
    const updated = flags.filter((flag) => flag.id !== flagId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    onFlagsChange(updated);
  }

  function sendReminder(flag: MissingMediaFlag) {
    const reminder = {
      id: randomId(),
      runId: flag.runId,
      assetTag: flag.assetTag,
      jobNumber: flag.jobNumber,
      workflowName: flag.workflowName,
      sentAt: new Date().toISOString(),
      sentByName,
    };
    const existing = JSON.parse(localStorage.getItem(REMINDER_STORAGE_KEY) ?? "[]");
    localStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify([...existing, reminder]));
    window.dispatchEvent(new Event("installer-photo-reminders-changed"));
    onReminderSent?.(flag.id);
  }

  return (
    <Box
      className="glass-card"
      sx={{ p: 2, border: "1px solid", borderColor: "warning.dark", background: "rgba(237,108,2,0.07)" }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <PhotoCameraOutlined sx={{ fontSize: 18, color: "warning.main" }} />
        <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora", flex: 1 }}>
          Runs Missing Media
        </Typography>
        <Chip
          label={visibleFlags.length}
          size="small"
          color="warning"
          variant="outlined"
          sx={{ height: 20, fontSize: "0.7rem" }}
        />
        {variant === "pm" && (
          <Button size="small" variant="text" color="warning" sx={{ fontSize: "0.72rem" }} onClick={dismissAll}>
            Dismiss all
          </Button>
        )}
      </Stack>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
        {variant === "installer"
          ? "Your completed runs with missing photo or video evidence — tap to upload missing media"
          : "Workflow runs completed without all required photos or videos captured"}
      </Typography>
      <Stack spacing={variant === "pm" ? 0.75 : 0.5}>
        {visibleFlags.map((flag) => (
          <Stack key={flag.id} direction="row" alignItems={variant === "pm" ? "flex-start" : "center"} spacing={1}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.3 }}>
                {flag.jobNumber ? `${flag.jobNumber}: ` : ""}
                {flag.assetTag}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {flag.workflowName} - {fmtDate(flag.completedAt)}
              </Typography>
              <Typography variant="caption" color="warning.main" display="block">
                {variant === "pm"
                  ? `${flag.totalCaptured}/${flag.totalExpected} media steps captured`
                  : `${flag.totalCaptured} of ${flag.totalExpected} media steps done`}
              </Typography>
              {variant === "pm" &&
                flag.missingSteps?.slice(0, 3).map((step) => (
                  <Typography
                    key={`${step.stepId}-${step.inputId}`}
                    variant="caption"
                    color="text.disabled"
                    display="block"
                    sx={{ pl: 1 }}
                  >
                    - {step.stepTitle} - {step.inputLabel}: {step.captured} captured
                  </Typography>
                ))}
              {variant === "pm" && (flag.missingSteps?.length ?? 0) > 3 && (
                <Typography variant="caption" color="text.disabled" display="block" sx={{ pl: 1 }}>
                  +{(flag.missingSteps?.length ?? 0) - 3} more...
                </Typography>
              )}
            </Box>
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
              {variant === "installer" ? (
                <Button
                  size="small"
                  variant="outlined"
                  color="warning"
                  sx={{ fontSize: "0.7rem", whiteSpace: "nowrap" }}
                  onClick={() => onUploadPhotos?.(flag)}
                >
                  Add Missing Photos
                </Button>
              ) : (
                <>
                  <Button
                    size="small"
                    variant="outlined"
                    color="info"
                    sx={{ fontSize: "0.7rem", whiteSpace: "nowrap" }}
                    onClick={() => onOpenRepair?.(flag)}
                  >
                    Open Repair
                  </Button>
                  <Button
                    size="small"
                    variant="text"
                    color="warning"
                    sx={{ fontSize: "0.7rem", whiteSpace: "nowrap" }}
                    disabled={reminderSentId === flag.id}
                    onClick={() => sendReminder(flag)}
                  >
                    {reminderSentId === flag.id ? "Sent" : "Notify Field User"}
                  </Button>
                </>
              )}
              <Button
                size="small"
                variant="text"
                color="inherit"
                sx={{ fontSize: "0.65rem", minWidth: 0, px: 1, opacity: 0.6 }}
                onClick={() => dismissOne(flag.id)}
              >
                x
              </Button>
            </Stack>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}
