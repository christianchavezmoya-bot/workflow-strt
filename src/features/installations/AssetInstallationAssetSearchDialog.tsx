import { SearchOutlined } from "@mui/icons-material";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { ProjectAsset } from "../../types/projectAsset";
import type { User } from "../../types/user";
import type { Project } from "../../types/project";
import type { ProjectCaptureSearchHit } from "../../utils/projectCaptureTable";
import {
  rankAssetSearchResults,
  resolveAssetSearchInstallerName,
  resolveAssetSearchProjectLabel,
} from "./assetInstallationAssetSearchLogic";

type Props = {
  open: boolean;
  query: string;
  activeFilter: string;
  assets: ProjectAsset[];
  users: User[];
  projects: Project[];
  captureIndexByAsset: Record<string, { hits: ProjectCaptureSearchHit[] } | undefined>;
  onClose: () => void;
  onQueryChange: (query: string) => void;
  onSelectAsset: (asset: ProjectAsset) => void;
  onClearFilter: () => void;
};

const STATUS_COLORS: Record<string, "default" | "primary" | "success" | "error"> = {
  NotStarted: "default",
  InProgress: "primary",
  Complete: "success",
  Issue: "error",
};

export default function AssetInstallationAssetSearchDialog({
  open,
  query,
  activeFilter,
  assets,
  users,
  projects,
  captureIndexByAsset,
  onClose,
  onQueryChange,
  onSelectAsset,
  onClearFilter,
}: Props) {
  const results = rankAssetSearchResults(assets, query, users, captureIndexByAsset);
  const trimmedQuery = query.trim();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 2 } }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <SearchOutlined fontSize="small" />
          <span>Search Assets</span>
        </Stack>
      </DialogTitle>
      <DialogContent sx={{ pt: "8px !important" }}>
        <TextField
          autoFocus
          fullWidth
          size="small"
          placeholder="Tag, serial, brand, feature, or field (min 2 chars)…"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchOutlined sx={{ fontSize: 18, color: "text.secondary" }} />
              </InputAdornment>
            ),
          }}
          sx={{ mb: 1.5 }}
        />
        {trimmedQuery.length < 2 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
            Type at least 2 characters to search
          </Typography>
        ) : results.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
            No assets match "{query}"
          </Typography>
        ) : (
          <List dense disablePadding sx={{ maxHeight: 360, overflowY: "auto" }}>
            {results.map(({ asset, matchLabel }) => {
              const jobNumber = resolveAssetSearchProjectLabel(asset, projects);
              const installer = resolveAssetSearchInstallerName(asset, users);
              return (
                <ListItem key={asset.id} disablePadding divider>
                  <ListItemButton onClick={() => onSelectAsset(asset)} sx={{ py: 1, gap: 1 }}>
                    <ListItemText
                      primary={
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="body2" fontWeight={600}>{asset.assetTag}</Typography>
                          {asset.serialNumber && (
                            <Typography variant="caption" color="text.secondary">S/N: {asset.serialNumber}</Typography>
                          )}
                          <Chip size="small" label={asset.status} color={STATUS_COLORS[asset.status] ?? "default"} sx={{ height: 18, fontSize: 10 }} />
                        </Stack>
                      }
                      secondary={
                        <Stack spacing={0.25}>
                          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            {jobNumber && <Typography variant="caption" color="text.secondary">{jobNumber}</Typography>}
                            {installer && <Typography variant="caption" color="text.secondary">· {installer}</Typography>}
                          </Stack>
                          {matchLabel && (
                            <Typography variant="caption" color="primary.main" sx={{ display: "block" }}>
                              {matchLabel}
                            </Typography>
                          )}
                        </Stack>
                      }
                    />
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {activeFilter && (
          <Button size="small" color="inherit" onClick={onClearFilter}>
            Clear filter
          </Button>
        )}
        <Box sx={{ flex: 1 }} />
        <Button size="small" onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
