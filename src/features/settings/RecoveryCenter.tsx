import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Divider,
  FormControl,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import api from "../../services/api";

interface BackupEntry {
  fileName: string;
  fullPath: string;
  sizeBytes: number;
  createdAtUtc: string;
}

interface RecycleBinItem {
  entityType: "project" | "installation" | "asset" | "document";
  id: string;
  title: string;
  subtitle?: string | null;
  parentId?: string | null;
  parentTitle?: string | null;
  deletedAtUtc?: string | null;
  deletedByUserId?: string | null;
}

interface BackupCatalogItem {
  entityType: "project" | "asset" | "document";
  id: string;
  title: string;
  subtitle?: string | null;
  parentId?: string | null;
  parentTitle?: string | null;
  isDeleted: boolean;
  deletedAtUtc?: string | null;
}

interface SelectiveRestoreResult {
  entityType: string;
  entityId: string;
  title: string;
  recordsRestored: number;
  note?: string | null;
}

const entityLabel = {
  all: "All",
  project: "Projects",
  installation: "Installations",
  asset: "Assets",
  document: "Documents",
} as const;

export default function RecoveryCenter() {
  const [message, setMessage] = useState<{ severity: "success" | "error" | "info"; text: string } | null>(null);

  const [recycleType, setRecycleType] = useState<"all" | "project" | "installation" | "asset" | "document">("all");
  const [recycleSearch, setRecycleSearch] = useState("");
  const [recycleItems, setRecycleItems] = useState<RecycleBinItem[]>([]);
  const [recycleLoading, setRecycleLoading] = useState(false);
  const [recycleBusyId, setRecycleBusyId] = useState<string | null>(null);

  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupCreating, setBackupCreating] = useState(false);
  const [backupRestoringFile, setBackupRestoringFile] = useState<string | null>(null);

  const [selectedBackup, setSelectedBackup] = useState("");
  const [catalogType, setCatalogType] = useState<"project" | "asset" | "document">("project");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogItems, setCatalogItems] = useState<BackupCatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogBusyId, setCatalogBusyId] = useState<string | null>(null);

  const loadRecycleBin = async () => {
    setRecycleLoading(true);
    try {
      const response = await api.get<RecycleBinItem[]>("/settings/recycle-bin", {
        params: {
          entityType: recycleType === "all" ? undefined : recycleType,
          search: recycleSearch.trim() || undefined,
        },
      });
      setRecycleItems(response.data);
    } catch {
      setRecycleItems([]);
      setMessage({ severity: "error", text: "Failed to load recycle bin items." });
    } finally {
      setRecycleLoading(false);
    }
  };

  const loadBackups = async () => {
    setBackupLoading(true);
    try {
      const response = await api.get<BackupEntry[]>("/settings/backups");
      setBackups(response.data);
      if (!selectedBackup && response.data.length > 0) {
        setSelectedBackup(response.data[0].fileName);
      }
    } catch {
      setBackups([]);
      setMessage({ severity: "error", text: "Failed to load database backups." });
    } finally {
      setBackupLoading(false);
    }
  };

  const loadCatalog = async () => {
    if (!selectedBackup) {
      setMessage({ severity: "info", text: "Select a backup file first." });
      return;
    }

    setCatalogLoading(true);
    try {
      const response = await api.get<BackupCatalogItem[]>("/settings/backups/catalog", {
        params: {
          fileName: selectedBackup,
          entityType: catalogType,
          search: catalogSearch.trim() || undefined,
        },
      });
      setCatalogItems(response.data);
    } catch (error: any) {
      setCatalogItems([]);
      setMessage({ severity: "error", text: error?.response?.data ?? "Failed to load backup catalog." });
    } finally {
      setCatalogLoading(false);
    }
  };

  useEffect(() => {
    void loadRecycleBin();
    void loadBackups();
  }, []);

  const restoreRecycleItem = async (item: RecycleBinItem) => {
    setRecycleBusyId(item.id);
    try {
      if (item.entityType === "project") {
        await api.post(`/projects/${item.id}/restore`);
      } else if (item.entityType === "installation") {
        await api.post(`/installations/${item.id}/restore`);
      } else if (item.entityType === "asset") {
        await api.post(`/project-assets/${item.id}/restore`);
      } else {
        await api.post(`/documents/${item.id}/restore`);
      }
      setMessage({ severity: "success", text: `${item.title} restored.` });
      await loadRecycleBin();
    } catch (error: any) {
      setMessage({ severity: "error", text: error?.response?.data ?? `Failed to restore ${item.title}.` });
    } finally {
      setRecycleBusyId(null);
    }
  };

  const purgeRecycleItem = async (item: RecycleBinItem) => {
    if (!window.confirm(`Permanently delete ${item.title}? This cannot be undone.`)) return;

    setRecycleBusyId(item.id);
    try {
      if (item.entityType === "project") {
        await api.delete(`/projects/${item.id}/purge`);
      } else if (item.entityType === "installation") {
        await api.delete(`/installations/${item.id}/purge`);
      } else if (item.entityType === "asset") {
        await api.delete(`/project-assets/${item.id}/purge`);
      } else {
        await api.delete(`/documents/${item.id}/purge`);
      }
      setMessage({ severity: "success", text: `${item.title} permanently deleted.` });
      await loadRecycleBin();
    } catch (error: any) {
      setMessage({ severity: "error", text: error?.response?.data ?? `Failed to purge ${item.title}.` });
    } finally {
      setRecycleBusyId(null);
    }
  };

  const createBackup = async () => {
    setBackupCreating(true);
    try {
      await api.post("/settings/backups/create");
      await loadBackups();
      setMessage({ severity: "success", text: "Backup created." });
    } catch {
      setMessage({ severity: "error", text: "Failed to create backup." });
    } finally {
      setBackupCreating(false);
    }
  };

  const restoreDatabase = async (fileName: string) => {
    if (!window.confirm(`Restore the full database from ${fileName}? This rolls the database back to that snapshot.`)) return;

    setBackupRestoringFile(fileName);
    try {
      const response = await api.post<{ restoredFromFileName: string; safeguardBackupFileName: string; restoredAtUtc: string }>(
        "/settings/backups/restore",
        { fileName }
      );
      setMessage({
        severity: "success",
        text: `Database restored from ${response.data.restoredFromFileName}. Safeguard backup: ${response.data.safeguardBackupFileName}.`,
      });
      await loadBackups();
      await loadRecycleBin();
    } catch (error: any) {
      setMessage({ severity: "error", text: error?.response?.data ?? "Failed to restore the full database." });
    } finally {
      setBackupRestoringFile(null);
    }
  };

  const selectiveRestore = async (item: BackupCatalogItem) => {
    setCatalogBusyId(item.id);
    try {
      const response = await api.post<SelectiveRestoreResult>("/settings/backups/restore-item", {
        fileName: selectedBackup,
        entityType: item.entityType,
        entityId: item.id,
      });
      const suffix = response.data.note ? ` ${response.data.note}` : "";
      setMessage({
        severity: "success",
        text: `${response.data.title} restored from backup.${suffix}`,
      });
      await loadRecycleBin();
    } catch (error: any) {
      setMessage({ severity: "error", text: error?.response?.data ?? `Failed to restore ${item.title} from backup.` });
    } finally {
      setCatalogBusyId(null);
    }
  };

  return (
    <Stack spacing={2} sx={{ marginTop: 2 }}>
      <Typography variant="h6">Recovery Center</Typography>
      <Typography variant="body2" color="text.secondary">
        Use the recycle bin for normal recovery. Use full backup restore only when you need to roll the entire database back. Selective restore imports one project, asset, or document from a backup without replacing newer data.
      </Typography>
      <Alert severity="info">
        Database backups only contain the SQLite data file. Library documents can be selectively restored from backup only if their physical file still exists in server storage. Deleted records remain recoverable from the recycle bin until they are purged.
      </Alert>
      {message && <Alert severity={message.severity}>{message.text}</Alert>}

      <Divider sx={{ borderColor: "rgba(255,255,255,0.08)" }} />

      <Stack spacing={1.5}>
        <Typography variant="subtitle1">Recycle Bin</Typography>
        <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <Select value={recycleType} onChange={(event) => setRecycleType(event.target.value as typeof recycleType)}>
              <MenuItem value="all">{entityLabel.all}</MenuItem>
              <MenuItem value="project">{entityLabel.project}</MenuItem>
              <MenuItem value="installation">{entityLabel.installation}</MenuItem>
              <MenuItem value="asset">{entityLabel.asset}</MenuItem>
              <MenuItem value="document">{entityLabel.document}</MenuItem>
            </Select>
          </FormControl>
          <TextField
            size="small"
            fullWidth
            label="Search recycle bin"
            value={recycleSearch}
            onChange={(event) => setRecycleSearch(event.target.value)}
          />
          <Button variant="outlined" onClick={() => void loadRecycleBin()} disabled={recycleLoading}>
            {recycleLoading ? "Loading..." : "Refresh"}
          </Button>
        </Stack>
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table size="small" sx={{ minWidth: 760 }}>
            <TableHead>
              <TableRow>
                <TableCell>Deleted</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Title</TableCell>
                <TableCell>Context</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {recycleItems.map((item) => (
                <TableRow key={`${item.entityType}-${item.id}`}>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>{item.deletedAtUtc ? new Date(item.deletedAtUtc).toLocaleString() : "-"}</TableCell>
                  <TableCell sx={{ textTransform: "capitalize" }}>{item.entityType}</TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>{item.title}</Typography>
                    {item.subtitle && <Typography variant="caption" color="text.secondary">{item.subtitle}</Typography>}
                  </TableCell>
                  <TableCell>{item.parentTitle ?? "-"}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1}>
                      <Button size="small" variant="contained" onClick={() => void restoreRecycleItem(item)} disabled={recycleBusyId === item.id}>
                        Restore
                      </Button>
                      <Button size="small" color="error" variant="outlined" onClick={() => void purgeRecycleItem(item)} disabled={recycleBusyId === item.id}>
                        Purge
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
              {recycleItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Typography variant="body2" color="text.secondary">
                      No deleted records found for the current filter.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Stack>

      <Divider sx={{ borderColor: "rgba(255,255,255,0.08)" }} />

      <Stack spacing={1.5}>
        <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ xs: "stretch", md: "center" }} spacing={1}>
          <Box>
            <Typography variant="subtitle1">Database Backups</Typography>
            <Typography variant="body2" color="text.secondary">
              Full restore replaces the live database and creates a safeguard backup first.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" onClick={() => void loadBackups()} disabled={backupLoading}>
              {backupLoading ? "Loading..." : "Refresh"}
            </Button>
            <Button variant="contained" onClick={() => void createBackup()} disabled={backupCreating}>
              {backupCreating ? "Creating..." : "Create backup"}
            </Button>
          </Stack>
        </Stack>
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table size="small" sx={{ minWidth: 820 }}>
            <TableHead>
              <TableRow>
                <TableCell>Created</TableCell>
                <TableCell>File</TableCell>
                <TableCell>Size</TableCell>
                <TableCell>Path</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {backups.map((backup) => (
                <TableRow key={backup.fullPath}>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>{new Date(backup.createdAtUtc).toLocaleString()}</TableCell>
                  <TableCell>{backup.fileName}</TableCell>
                  <TableCell>{(backup.sizeBytes / (1024 * 1024)).toFixed(2)} MB</TableCell>
                  <TableCell sx={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{backup.fullPath}</TableCell>
                  <TableCell>
                    <Button
                      size="small"
                      color="warning"
                      variant="outlined"
                      onClick={() => void restoreDatabase(backup.fileName)}
                      disabled={backupRestoringFile === backup.fileName}
                    >
                      Restore full DB
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {backups.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Typography variant="body2" color="text.secondary">
                      No backups loaded.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Stack>

      <Divider sx={{ borderColor: "rgba(255,255,255,0.08)" }} />

      <Stack spacing={1.5}>
        <Typography variant="subtitle1">Selective Restore From Backup</Typography>
        <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
          <FormControl size="small" sx={{ minWidth: 260 }}>
            <Select value={selectedBackup} onChange={(event) => setSelectedBackup(event.target.value)}>
              {backups.map((backup) => (
                <MenuItem key={backup.fileName} value={backup.fileName}>
                  {backup.fileName}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <Select value={catalogType} onChange={(event) => setCatalogType(event.target.value as typeof catalogType)}>
              <MenuItem value="project">Project</MenuItem>
              <MenuItem value="asset">Asset</MenuItem>
              <MenuItem value="document">Document</MenuItem>
            </Select>
          </FormControl>
          <TextField
            size="small"
            fullWidth
            label="Search selected backup"
            value={catalogSearch}
            onChange={(event) => setCatalogSearch(event.target.value)}
          />
          <Button variant="outlined" onClick={() => void loadCatalog()} disabled={catalogLoading}>
            {catalogLoading ? "Loading..." : "Search backup"}
          </Button>
        </Stack>
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table size="small" sx={{ minWidth: 760 }}>
            <TableHead>
              <TableRow>
                <TableCell>Type</TableCell>
                <TableCell>Title</TableCell>
                <TableCell>Context</TableCell>
                <TableCell>Status In Backup</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {catalogItems.map((item) => (
                <TableRow key={`${item.entityType}-${item.id}`}>
                  <TableCell sx={{ textTransform: "capitalize" }}>{item.entityType}</TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>{item.title}</Typography>
                    {item.subtitle && <Typography variant="caption" color="text.secondary">{item.subtitle}</Typography>}
                  </TableCell>
                  <TableCell>{item.parentTitle ?? "-"}</TableCell>
                  <TableCell>{item.isDeleted ? "Deleted in backup" : "Active in backup"}</TableCell>
                  <TableCell>
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() => void selectiveRestore(item)}
                      disabled={catalogBusyId === item.id}
                    >
                      Restore this item
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {catalogItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Typography variant="body2" color="text.secondary">
                      Search a backup to see recoverable records.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Stack>
    </Stack>
  );
}
