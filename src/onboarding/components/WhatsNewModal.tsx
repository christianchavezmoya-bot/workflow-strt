import {
  Box, Button, Chip, Dialog, DialogContent, Divider,
  Stack, Typography, Link,
} from "@mui/material";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import { useNavigate } from "react-router-dom";
import type { WhatsNewEntry } from "../types/onboarding.types";

interface Props {
  open: boolean;
  entries: WhatsNewEntry[];
  onDismiss: () => void;
}

export default function WhatsNewModal({ open, entries, onDismiss }: Props) {
  const navigate = useNavigate();

  if (!entries.length) return null;

  // Show the most recent entry's title; list bullets from all unseen entries
  const latest = entries[0];

  function handleBulletLink(pageKey?: string) {
    if (pageKey) {
      onDismiss();
      navigate(pageKey);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onDismiss}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3, p: 0.5 } }}
    >
      <DialogContent sx={{ overflowY: "auto", maxHeight: "80vh" }}>
        <Stack spacing={2.5}>
          {/* Header */}
          <Stack direction="row" alignItems="center" spacing={1.25}>
            <AutoAwesomeOutlinedIcon color="primary" />
            <Box>
              <Typography variant="h6" sx={{ fontFamily: "Sora", fontWeight: 700, lineHeight: 1.2 }}>
                {latest.title}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Released {latest.releaseDate}
              </Typography>
            </Box>
          </Stack>

          {/* Bullets — show all unseen entries */}
          {entries.map((entry, ei) => (
            <Box key={entry.version}>
              {ei > 0 && (
                <Stack direction="row" alignItems="center" spacing={1} mb={1}>
                  <Divider sx={{ flex: 1 }} />
                  <Chip label={`v${entry.version}`} size="small" variant="outlined" sx={{ fontSize: 10 }} />
                  <Divider sx={{ flex: 1 }} />
                </Stack>
              )}
              <Stack spacing={1}>
                {entry.bullets.map((b, i) => (
                  <Stack key={i} direction="row" spacing={1} alignItems="flex-start">
                    <Box
                      sx={{
                        width: 6, height: 6, borderRadius: "50%",
                        bgcolor: "primary.main", mt: 0.75, flexShrink: 0,
                      }}
                    />
                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                      {b.text}
                      {b.pageKey && (
                        <Link
                          component="button"
                          variant="body2"
                          onClick={() => handleBulletLink(b.pageKey)}
                          sx={{ ml: 0.5, verticalAlign: "baseline" }}
                        >
                          View →
                        </Link>
                      )}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            </Box>
          ))}

          {/* Action */}
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Button variant="text" size="small" onClick={onDismiss} sx={{ color: "text.disabled" }}>
              Skip for now
            </Button>
            <Button variant="contained" onClick={onDismiss}>Got it</Button>
          </Stack>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
