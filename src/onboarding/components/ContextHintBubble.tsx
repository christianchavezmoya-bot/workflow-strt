import { Alert, AlertTitle, IconButton, Slide, Stack, Typography } from "@mui/material";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { PAGE_HINTS } from "../config/pageHints.config";

interface Props {
  hintId: string;
  onDismiss: (hintId: string) => void;
}

export default function ContextHintBubble({ hintId, onDismiss }: Props) {
  const hint = PAGE_HINTS.find((h) => h.id === hintId);
  const [visible, setVisible] = useState(false);
  const location = useLocation();

  // Animate in after short delay so it doesn't compete with page load
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 600);
    return () => clearTimeout(t);
  }, [location.pathname]);

  if (!hint) return null;

  function handleDismiss() {
    setVisible(false);
    setTimeout(() => onDismiss(hintId), 300);
  }

  return (
    <Slide in={visible} direction="down" mountOnEnter unmountOnExit>
      <Alert
        severity="info"
        icon={false}
        sx={{
          position: "fixed",
          top: 70,
          right: 16,
          zIndex: 1300,
          maxWidth: 320,
          borderRadius: 2,
          boxShadow: 6,
          border: "1px solid",
          borderColor: "primary.dark",
          bgcolor: "background.paper",
          "& .MuiAlert-message": { width: "100%" },
        }}
        action={
          <IconButton size="small" onClick={handleDismiss}>
            <CloseOutlinedIcon sx={{ fontSize: 15 }} />
          </IconButton>
        }
      >
        <Stack spacing={0.25}>
          <AlertTitle sx={{ fontWeight: 700, fontSize: 13, mb: 0 }}>{hint.title}</AlertTitle>
          <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5 }}>
            {hint.body}
          </Typography>
        </Stack>
      </Alert>
    </Slide>
  );
}
