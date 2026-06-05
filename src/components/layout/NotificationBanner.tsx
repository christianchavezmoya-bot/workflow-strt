import { Box, Button, Collapse, IconButton, Stack, Typography } from "@mui/material";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import CloseIcon from "@mui/icons-material/Close";
import { useNotificationInbox } from "../../contexts/NotificationInboxContext";

export default function NotificationBanner() {
  const { bannerNotification, dismissBanner, acknowledge } = useNotificationInbox();
  const isTestMode = !!localStorage.getItem("test_mode_original_auth");

  if (!bannerNotification) return null;

  return (
    <Collapse in={!!bannerNotification}>
      <Box
        sx={{
          position: "fixed",
          top: isTestMode ? 32 : 0,
          left: 0,
          right: 0,
          zIndex: 9998,
          bgcolor: "warning.main",
          color: "warning.contrastText",
          px: 2,
          py: 0.75,
          boxShadow: "0 8px 28px rgba(15, 23, 42, 0.22)",
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="center">
          <NotificationsNoneOutlinedIcon sx={{ fontSize: 18 }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" fontWeight={800} sx={{ display: "block", lineHeight: 1.2 }}>
              {bannerNotification.title}
            </Typography>
            <Typography variant="caption" sx={{ display: "block", opacity: 0.95 }}>
              {bannerNotification.message}
            </Typography>
          </Box>
          <Button
            size="small"
            variant="outlined"
            onClick={() => void acknowledge([bannerNotification.id])}
            sx={{
              color: "warning.contrastText",
              borderColor: "warning.contrastText",
              py: 0,
              minWidth: 0,
              fontSize: "0.7rem",
            }}
          >
            Acknowledge
          </Button>
          <IconButton size="small" onClick={dismissBanner} sx={{ color: "warning.contrastText" }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      </Box>
    </Collapse>
  );
}
