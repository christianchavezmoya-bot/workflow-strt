import { PhotoCameraOutlined } from "@mui/icons-material";
import { Box, Button, Chip, Stack, Typography } from "@mui/material";
import { fmtDate } from "./dashboardPageLogic";
import type { PhotoUpdateNotification } from "./photoUploadTypes";

const STORAGE_KEY = "pm_photo_update_notifications";

type Props = {
  notifications: PhotoUpdateNotification[];
  onNotificationsChange: (notifications: PhotoUpdateNotification[]) => void;
};

export default function DashboardPhotoUpdateNotificationsSection({
  notifications,
  onNotificationsChange,
}: Props) {
  if (notifications.length === 0) return null;

  function dismissAll() {
    localStorage.removeItem(STORAGE_KEY);
    onNotificationsChange([]);
  }

  function dismissOne(notificationId: string) {
    const updated = notifications.filter((notification) => notification.id !== notificationId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    onNotificationsChange(updated);
  }

  return (
    <Box
      className="glass-card"
      sx={{ p: 2, border: "1px solid", borderColor: "info.dark", background: "rgba(2,136,209,0.07)" }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <PhotoCameraOutlined sx={{ fontSize: 18, color: "info.main" }} />
        <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora", flex: 1 }}>
          Installer Media Updates
        </Typography>
        <Chip
          label={notifications.length}
          size="small"
          color="info"
          variant="outlined"
          sx={{ height: 20, fontSize: "0.7rem" }}
        />
        <Button size="small" variant="text" color="info" sx={{ fontSize: "0.72rem" }} onClick={dismissAll}>
          Dismiss all
        </Button>
      </Stack>
      <Stack spacing={0.5} mt={1}>
        {notifications.map((notification) => (
          <Stack key={notification.id} direction="row" alignItems="center" spacing={1}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.3 }}>
                {notification.installerName} updated media for {notification.assetTag}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {notification.workflowName} - {fmtDate(notification.updatedAt)}
              </Typography>
              <Typography
                variant="caption"
                display="block"
                color={notification.wasComplete ? "success.main" : "warning.main"}
              >
                {notification.wasComplete
                  ? "All media added"
                  : `${notification.stillMissing} step${notification.stillMissing !== 1 ? "s" : ""} still missing`}
              </Typography>
            </Box>
            <Button
              size="small"
              variant="text"
              color="inherit"
              sx={{ fontSize: "0.65rem", minWidth: 0, px: 1, opacity: 0.6 }}
              onClick={() => dismissOne(notification.id)}
            >
              x
            </Button>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}
