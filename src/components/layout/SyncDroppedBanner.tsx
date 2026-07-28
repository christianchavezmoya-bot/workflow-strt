/**
 * SyncDroppedBanner — app-wide, persistent notification for permanently-failed
 * sync actions.
 *
 * - Always mounted in AppShell so it survives any screen navigation.
 * - Reads persisted dropped actions from IndexedDB on mount and on every
 *   "sync-action-dropped" event, so it survives app reload.
 * - Shows a non-blocking warning strip above the Topbar with a dismiss button.
 * - Does NOT trigger any network calls — read-only, purely reactive.
 *
 * A dropped action means the app exhausted all 20 retry attempts (~1 hour)
 * and the change was permanently lost. The technician needs to manually redo
 * or escalate the affected work.
 */

import { Alert, Box, Button, Stack, Typography } from "@mui/material";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import { useCallback, useEffect, useState } from "react";
import {
  droppedActionsGetAll,
  droppedActionDismiss,
  droppedActionsDismissAll,
  droppedActionRequeue,
  type DroppedAction,
} from "../../services/localDB";
import { resolvePendingActionLabel } from "../../utils/syncActionLabels";

function actionLabel(action: DroppedAction): string {
  const entity = action.entityType
    ? `${action.entityType.charAt(0).toUpperCase() + action.entityType.slice(1)}`
    : "Record";
  const op = action.opType ? `${action.opType} ` : "";
  return `${op}${entity}`;
}

function actionDetail(action: DroppedAction): string {
  if (action.lastError) return `Last error: ${action.lastError}`;
  return `Attempted at ${new Date(action.createdAt).toLocaleString()}`;
}

export default function SyncDroppedBanner() {
  const [dropped, setDropped] = useState<DroppedAction[]>([]);
  const [labels, setLabels] = useState<Record<string, { title: string; subtitle: string }>>({});

  const load = useCallback(async () => {
    setDropped(await droppedActionsGetAll());
  }, []);

  useEffect(() => {
    void load();
    const h = () => void load();
    window.addEventListener("sync-action-dropped", h);
    return () => window.removeEventListener("sync-action-dropped", h);
  }, [load]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const entries = await Promise.all(
        dropped.map(async (d) => {
          if (!d.url) return [d.id, { title: actionLabel(d), subtitle: d.entityId.slice(0, 8) }] as const;
          const label = await resolvePendingActionLabel({
            id: d.id,
            url: d.url,
            method: d.method ?? "POST",
            body: d.body,
            entityType: d.entityType,
            entityId: d.entityId,
            optimisticPatch: d.optimisticPatch ?? {},
            createdAt: d.createdAt,
            retries: 0,
            status: "failed",
            opType: d.opType,
          });
          return [d.id, label] as const;
        }),
      );
      if (!active) return;
      setLabels(Object.fromEntries(entries));
    })();
    return () => { active = false; };
  }, [dropped]);

  const handleRequeue = async (id: string) => {
    const ok = await droppedActionRequeue(id);
    if (ok) window.dispatchEvent(new Event("sync-request-flush"));
    void load();
  };

  const handleDismiss = async (id: string) => {
    await droppedActionDismiss(id);
    void load();
  };

  const handleDismissAll = async () => {
    await droppedActionsDismissAll();
    void load();
  };

  if (dropped.length === 0) return null;

  const summary =
    dropped.length === 1
      ? `1 change permanently failed to sync`
      : `${dropped.length} changes permanently failed to sync`;

  return (
    <Box
      sx={{
        width: "100%",
        bgcolor: "rgba(239,68,68,0.08)",
        borderBottom: "1px solid rgba(239,68,68,0.3)",
      }}
    >
      <Stack spacing={0.5} sx={{ px: { xs: 1.5, sm: 2 }, py: 0.75 }}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          spacing={1}
        >
          <Stack direction="row" alignItems="center" spacing={1}>
            <ErrorOutlineIcon sx={{ color: "error.main", fontSize: 18 }} />
            <Typography
              variant="body2"
              fontWeight={700}
              color="error.main"
              sx={{ fontSize: "0.8rem" }}
            >
              {summary} — manual action required
            </Typography>
          </Stack>
          <Button
            size="small"
            color="inherit"
            onClick={handleDismissAll}
            sx={{
              color: "error.light",
              fontSize: "0.72rem",
              minWidth: 0,
              px: 1,
              py: 0.25,
            }}
          >
            Dismiss all
          </Button>
        </Stack>

        {dropped.map((action) => (
          <Stack
            key={action.id}
            direction="row"
            alignItems="flex-start"
            spacing={1}
            sx={{
              bgcolor: "rgba(239,68,68,0.06)",
              borderRadius: 1,
              px: 1.25,
              py: 0.75,
              border: "1px solid rgba(239,68,68,0.2)",
            }}
          >
            <Stack spacing={0.25} flex={1} minWidth={0}>
              <Typography
                variant="caption"
                fontWeight={600}
                color="error.light"
                sx={{ fontSize: "0.75rem" }}
              >
                {labels[action.id]?.title ?? actionLabel(action)}
                {labels[action.id]?.subtitle && (
                  <Typography
                    component="span"
                    variant="caption"
                    sx={{ fontSize: "0.7rem", color: "text.disabled", ml: 0.5, fontWeight: 400 }}
                  >
                    · {labels[action.id].subtitle}
                  </Typography>
                )}
              </Typography>
              <Typography
                variant="caption"
                color="text.disabled"
                sx={{ fontSize: "0.68rem" }}
              >
                {actionDetail(action)}
              </Typography>
            </Stack>
            <Stack direction="row" spacing={0.5} flexShrink={0}>
              {action.url && action.method && (
                <Button
                  size="small"
                  color="inherit"
                  onClick={() => void handleRequeue(action.id)}
                  sx={{ color: "error.light", fontSize: "0.68rem", minWidth: 0, px: 0.75, py: 0.25 }}
                >
                  Re-queue
                </Button>
              )}
              <Button
                size="small"
                color="inherit"
                onClick={() => void handleDismiss(action.id)}
                sx={{
                  color: "text.disabled",
                  fontSize: "0.68rem",
                  minWidth: 0,
                  px: 0.75,
                  py: 0.25,
                  alignSelf: "center",
                }}
              >
                Dismiss
              </Button>
            </Stack>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}
