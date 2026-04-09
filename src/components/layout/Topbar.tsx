import { Avatar, Badge, Box, Button, CircularProgress, Divider, FormControl, IconButton, InputLabel, Menu, MenuItem, Popover, Select, Stack, Tab, Tabs, TextField, Tooltip, Typography, Chip } from "@mui/material";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import ViewSidebarOutlinedIcon from "@mui/icons-material/ViewSidebarOutlined";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import StarOutlinedIcon from "@mui/icons-material/StarOutlined";
import StarBorderOutlinedIcon from "@mui/icons-material/StarBorderOutlined";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useNotificationInbox } from "../../contexts/NotificationInboxContext";
import { useViewMode } from "../../contexts/ViewModeContext";
import { useAccessMode } from "../../contexts/AccessModeContext";
import { useFavoritesContext } from "../../contexts/FavoritesContext";
import { useAppSelector } from "../../store/hooks";
import GlobalSearchDialog from "./GlobalSearchDialog";
import { searchIndexService, type SearchIndexStatus } from "../../services/searchIndexService";
import { brandSettingsService } from "../../services/brandSettingsService";

const ROUTE_LABELS: Record<string, string> = {
  "/": "Dashboard",
  "/projects": "Projects",
  "/installations/assets": "Installations",
  "/work-instructions": "Work Instructions",
  "/documents": "Documents",
  "/admin": "Admin",
  "/admin/asset-registry": "Asset Registry",
  "/settings": "Settings",
  "/profile": "Profile",
};

// Human-readable labels for ?tab= URL params (Admin + Settings)
const TAB_LABELS: Record<string, string> = {
  // Admin tabs (dynamic type keys)
  users: "Users",
  roles: "Roles",
  customers: "Customers",
  offices: "Global Offices",
  products: "Products",
  // Settings tabs
  quickbase: "Integrations",
  sms: "SMS/SMTP",
  fields: "Fields/Data",
  "workflow-types": "Workflow Types",
  logo: "Business Logo",
  audit: "Audit Log",
};

const formatAgo = (utcDate?: string | null) => {
  if (!utcDate) return "never";
  const ts = Date.parse(utcDate);
  if (Number.isNaN(ts)) return "unknown";
  const deltaMs = Date.now() - ts;
  if (deltaMs < 60_000) return "just now";
  const mins = Math.floor(deltaMs / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const Topbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { notifications, unreadNotifications, loading: notificationsLoading, acknowledge } = useNotificationInbox();
  const { viewMode, toggleViewMode } = useViewMode();
  useAccessMode(); // keep provider side-effects (view-only banner in AppShell)
  const { isFavorited, getFavorite, add, remove } = useFavoritesContext();
  const products = useAppSelector((s) => s.products.items);
  const projects = useAppSelector((s) => s.projects.items);

  const [appName, setAppName] = useState("Field Operations");
  const [qbEnabled, setQbEnabled] = useState(false);
  const [qbHost, setQbHost] = useState("");
  const isAdminUser = useMemo(() => /admin/i.test(user?.role ?? ""), [user?.role]);

  useEffect(() => {
    brandSettingsService.get().then((s) => {
      if (s.appName) setAppName(s.appName);
    }).catch(() => {});
    const handler = (e: Event) => {
      const name = (e as CustomEvent<{ appName: string }>).detail?.appName;
      if (name) setAppName(name);
    };
    window.addEventListener("brand-name-changed", handler);
    return () => window.removeEventListener("brand-name-changed", handler);
  }, []);

  useEffect(() => {
    if (!isAdminUser) {
      setQbEnabled(false);
      setQbHost("");
      return;
    }

    import("../../services/settingsService").then(({ settingsService }) => {
      settingsService.getQuickbaseSettings().then((s) => {
        setQbEnabled(!!s?.enabled);
        setQbHost(s?.realmHostname ?? "");
      }).catch(() => {});
    });
  }, [isAdminUser]);

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [notificationsAnchor, setNotificationsAnchor] = useState<null | HTMLElement>(null);
  const [notificationView, setNotificationView] = useState<"unread" | "history">("unread");
  const [notificationTypeFilter, setNotificationTypeFilter] = useState("all");
  const menuOpen = Boolean(anchorEl);
  const [searchOpen, setSearchOpen] = useState(false);
  const [indexStatus, setIndexStatus] = useState<SearchIndexStatus | null>(null);
  const [indexLoading, setIndexLoading] = useState(false);
  const [indexPopoverAnchor, setIndexPopoverAnchor] = useState<null | HTMLElement>(null);

  const notificationGroup = (eventType: string) => {
    if (eventType.includes("assign")) return "assignments";
    if (eventType.includes("reminder")) return "reminders";
    if (eventType.includes("media")) return "media";
    if (eventType.includes("issue")) return "issues";
    return "workflow";
  };
  const visibleNotifications = useMemo(() => {
    const source = notificationView === "unread" ? unreadNotifications : notifications;
    return source.filter((notification) =>
      notificationTypeFilter === "all" || notificationGroup(notification.eventType) === notificationTypeFilter);
  }, [notificationView, unreadNotifications, notifications, notificationTypeFilter]);

  // ── Favorites star ───────────────────────────────────────────────────────────
  const currentPath = location.pathname + location.search;
  const alreadyFavorited = isFavorited(currentPath);

  const autoLabel = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const productId = params.get("product");
    const projectId = params.get("project");
    const tabKey = params.get("tab");
    const viewKey = params.get("view");
    const parts: string[] = [ROUTE_LABELS[location.pathname] ?? location.pathname];
    if (productId) {
      const p = products.find((p) => p.id === productId);
      if (p) parts.push(p.name);
    }
    if (projectId) {
      const proj = projects.find((p) => p.id === projectId);
      if (proj) parts.push(proj.jobNumber);
    }
    if (tabKey && TAB_LABELS[tabKey]) {
      parts.push(TAB_LABELS[tabKey]);
    }
    if (viewKey === "builder") {
      parts.push("Builder");
    }
    return parts.join(" — ");
  }, [location.pathname, location.search, products, projects]);

  const [starAnchor, setStarAnchor] = useState<null | HTMLElement>(null);
  const [favLabel, setFavLabel] = useState("");

  function handleStarClick(e: React.MouseEvent<HTMLElement>) {
    if (alreadyFavorited) {
      const existing = getFavorite(currentPath);
      if (existing) remove(existing.id);
    } else {
      setFavLabel(autoLabel);
      setStarAnchor(e.currentTarget);
    }
  }

  function handleFavSave() {
    const label = favLabel.trim() || autoLabel;
    add(label, currentPath);
    setStarAnchor(null);
  }
  // ─────────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const isAdmin = isAdminUser;
    if (!isAdmin) {
      setIndexStatus(null);
      return;
    }

    let active = true;
    const load = async () => {
      try {
        setIndexLoading(true);
        const next = await searchIndexService.getStatus();
        if (active) setIndexStatus(next);
      } catch {
        if (active) setIndexStatus(null);
      } finally {
        if (active) setIndexLoading(false);
      }
    };

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 10000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [isAdminUser]);

  useEffect(() => {
    function handleGlobalSearchShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener("keydown", handleGlobalSearchShortcut);
    return () => window.removeEventListener("keydown", handleGlobalSearchShortcut);
  }, []);

  useEffect(() => {
    const handleSideNavClick = () => {
      setSearchOpen(false);
    };
    window.addEventListener("app:side-nav-click", handleSideNavClick);
    return () => window.removeEventListener("app:side-nav-click", handleSideNavClick);
  }, []);

  const initials = useMemo(() => {
    const fullName = user?.fullName?.trim();
    if (fullName) {
      const parts = fullName.split(" ").filter(Boolean);
      const first = parts[0]?.[0] || "U";
      const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
      return `${first}${last}`.toUpperCase();
    }
    const email = user?.email?.trim();
    if (email) {
      return email.slice(0, 2).toUpperCase();
    }
    return "U";
  }, [user?.fullName, user?.email]);

  const handleOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    localStorage.removeItem("local_auth_user");
    localStorage.removeItem("mock_role");
    localStorage.removeItem("mock_office");
    localStorage.removeItem("test_mode_original_auth");
    handleClose();
    navigate("/login");
  };

  // ── Test-as-user switcher ─────────────────────────────────────────────────
  const notificationColor = (severity: string) => {
    if (severity === "success") return "success";
    if (severity === "warning") return "warning";
    if (severity === "error") return "error";
    return "info";
  };

  return (
    <Box className="topbar">
      <Stack direction="row" spacing={2} alignItems="center">
        <Chip
          icon={viewMode === "full" ? <ViewSidebarOutlinedIcon /> : <DashboardOutlinedIcon />}
          label={viewMode === "full" ? "Full View" : "Minimal View"}
          onClick={toggleViewMode}
          sx={{
            background: "rgba(45, 212, 191, 0.18)",
            color: "#9df0e5",
            border: "1px solid rgba(45, 212, 191, 0.3)",
            cursor: "pointer",
            "&:hover": {
              background: "rgba(45, 212, 191, 0.28)"
            }
          }}
        />
        <Stack spacing={0.5}>
          <Typography variant="h5" sx={{ fontFamily: "Sora" }}>
            {appName}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {autoLabel}
          </Typography>
        </Stack>
      </Stack>
      <Stack direction="row" spacing={2} alignItems="center">
        {qbEnabled && (() => {
          const provider = qbHost.includes("quickbase") ? "Quickbase"
            : qbHost.includes("salesforce") ? "Salesforce"
            : qbHost ? ((() => { try { return new URL(`https://${qbHost}`).hostname.split(".").slice(-2, -1)[0] ?? "API"; } catch { return "API"; } })())
            : "API";
          return (
            <Box className="status-chip">
              <span className="status-dot" />
              {provider} connected
            </Box>
          );
        })()}
        {isAdminUser && (
          <>
            <Chip
              size="small"
              onClick={(e) => setIndexPopoverAnchor(e.currentTarget)}
              icon={indexLoading || indexStatus?.isRunning ? <CircularProgress size={12} /> : undefined}
              label={
                indexStatus?.isRunning
                  ? `Indexing ${indexStatus.currentRunProcessed}/${Math.max(indexStatus.currentRunTotal, 0)}`
                  : `Index ${formatAgo(indexStatus?.lastRebuildCompletedAtUtc)}`
              }
              color={indexStatus?.lastError ? "error" : (indexStatus?.isRunning ? "warning" : "success")}
              variant="outlined"
              sx={{ cursor: "pointer" }}
            />
            <Popover
              open={Boolean(indexPopoverAnchor)}
              anchorEl={indexPopoverAnchor}
              onClose={() => setIndexPopoverAnchor(null)}
              anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
              transformOrigin={{ vertical: "top", horizontal: "right" }}
              slotProps={{ paper: { sx: { p: 2, width: 360 } } }}
            >
              <Stack spacing={1}>
                <Typography variant="subtitle2" fontWeight={700}>Search Index</Typography>
                <Typography variant="caption" color="text.secondary">
                  Queue: {indexStatus?.queueDepth ?? 0} | Running: {indexStatus?.isRunning ? "Yes" : "No"}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Last rebuild started: {indexStatus?.lastRebuildStartedAtUtc ? new Date(indexStatus.lastRebuildStartedAtUtc).toLocaleString() : "Never"}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Last rebuild completed: {indexStatus?.lastRebuildCompletedAtUtc ? new Date(indexStatus.lastRebuildCompletedAtUtc).toLocaleString() : "Never"}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Last rebuild items: {(indexStatus?.lastRebuildProcessed ?? 0)}/{(indexStatus?.lastRebuildTotal ?? 0)}
                </Typography>
                {indexStatus?.lastError ? (
                  <Typography variant="caption" color="error.main">
                    Last error: {indexStatus.lastError}
                  </Typography>
                ) : null}
                <Stack direction="row" justifyContent="flex-end">
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={async () => {
                      try {
                        await searchIndexService.rebuild();
                        const next = await searchIndexService.getStatus();
                        setIndexStatus(next);
                      } catch (error) {
                        console.error("Index rebuild failed:", error);
                      }
                    }}
                  >
                    Rebuild Now
                  </Button>
                </Stack>
              </Stack>
            </Popover>
          </>
        )}
        <Tooltip title={alreadyFavorited ? "Remove from Favorites" : "Add to Favorites"}>
          <IconButton color="inherit" onClick={handleStarClick}>
            {alreadyFavorited
              ? <StarOutlinedIcon sx={{ color: "#f59e0b" }} />
              : <StarBorderOutlinedIcon />}
          </IconButton>
        </Tooltip>

        {/* Add-favorite popover */}
        <Popover
          open={Boolean(starAnchor)}
          anchorEl={starAnchor}
          onClose={() => setStarAnchor(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
          slotProps={{ paper: { sx: { p: 2, width: 300 } } }}
        >
          <Stack spacing={1.5}>
            <Typography variant="subtitle2" fontWeight={700}>
              Add to Favorites
            </Typography>
            <TextField
              label="Name"
              size="small"
              fullWidth
              autoFocus
              value={favLabel}
              onChange={(e) => setFavLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleFavSave(); }}
            />
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button size="small" onClick={() => setStarAnchor(null)}>Cancel</Button>
              <Button size="small" variant="contained" onClick={handleFavSave}>Save</Button>
            </Stack>
          </Stack>
        </Popover>

        <IconButton color="inherit" onClick={() => setSearchOpen(true)}>
          <SearchOutlinedIcon />
        </IconButton>
        <IconButton color="inherit" onClick={(e) => setNotificationsAnchor(e.currentTarget)}>
          <Badge badgeContent={unreadNotifications.length} color="warning">
            <NotificationsNoneOutlinedIcon />
          </Badge>
        </IconButton>
        <Popover
          open={Boolean(notificationsAnchor)}
          anchorEl={notificationsAnchor}
          onClose={() => setNotificationsAnchor(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
          slotProps={{ paper: { sx: { p: 2, width: 440, maxHeight: 560 } } }}
        >
          <Stack spacing={1.5}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Box>
                <Typography variant="subtitle2" fontWeight={700}>Notifications</Typography>
                <Typography variant="caption" color="text.secondary">
                  {unreadNotifications.length} unread
                </Typography>
              </Box>
              <Button
                size="small"
                disabled={notificationsLoading || unreadNotifications.length === 0}
                onClick={() => void acknowledge()}
              >
                Acknowledge all
              </Button>
            </Stack>
            <Tabs
              value={notificationView}
              onChange={(_, value) => setNotificationView(value)}
              sx={{ minHeight: 32, "& .MuiTab-root": { minHeight: 32, py: 0.5 } }}
            >
              <Tab value="unread" label={`Unread (${unreadNotifications.length})`} />
              <Tab value="history" label={`History (${notifications.length})`} />
            </Tabs>
            <FormControl size="small" fullWidth>
              <InputLabel shrink>Type</InputLabel>
              <Select
                label="Type"
                value={notificationTypeFilter}
                onChange={(e) => setNotificationTypeFilter(e.target.value)}
              >
                <MenuItem value="all">All types</MenuItem>
                <MenuItem value="assignments">Assignments</MenuItem>
                <MenuItem value="workflow">Workflow</MenuItem>
                <MenuItem value="media">Media</MenuItem>
                <MenuItem value="issues">Issues</MenuItem>
                <MenuItem value="reminders">Reminders</MenuItem>
              </Select>
            </FormControl>
            <Divider />
            <Stack spacing={1} sx={{ maxHeight: 400, overflowY: "auto" }}>
              {visibleNotifications.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  No notifications yet.
                </Typography>
              )}
              {visibleNotifications.map((notification) => (
                <Box
                  key={notification.id}
                  sx={{
                    p: 1.25,
                    borderRadius: 1.5,
                    border: "1px solid",
                    borderColor: notification.isRead ? "divider" : "warning.light",
                    bgcolor: notification.isRead ? "background.paper" : "rgba(245, 158, 11, 0.08)",
                  }}
                >
                  <Stack direction="row" spacing={1} alignItems="flex-start">
                    <Chip
                      label={notification.severity}
                      size="small"
                      color={notificationColor(notification.severity) as "success" | "warning" | "error" | "info"}
                      variant="outlined"
                      sx={{ textTransform: "capitalize", height: 20, fontSize: "0.68rem" }}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={700}>
                        {notification.title}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
                        {notification.message}
                      </Typography>
                      <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 0.5 }}>
                        {new Date(notification.createdAtUtc).toLocaleString()} · {notificationGroup(notification.eventType)}
                      </Typography>
                    </Box>
                    {!notification.isRead && (
                      <Button size="small" onClick={() => void acknowledge([notification.id])}>
                        Ack
                      </Button>
                    )}
                  </Stack>
                </Box>
              ))}
            </Stack>
          </Stack>
        </Popover>
        <IconButton color="inherit" onClick={handleOpen}>
          <Avatar sx={{ bgcolor: "#2dd4bf", color: "#0b1d24" }}>{initials}</Avatar>
        </IconButton>

        {/* Profile menu */}
        <Menu
          anchorEl={anchorEl}
          open={menuOpen}
          onClose={handleClose}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
        >
          <MenuItem disabled>
            <Stack>
              <Typography variant="body2">{user?.fullName || "User"}</Typography>
              <Typography variant="caption" color="text.secondary">{user?.role}</Typography>
            </Stack>
          </MenuItem>
          <Divider />
          <MenuItem
            onClick={() => {
              handleClose();
              navigate("/profile");
            }}
          >
            Profile
          </MenuItem>
          <MenuItem onClick={handleLogout}>Logout</MenuItem>
        </Menu>
      </Stack>

      <GlobalSearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </Box>
  );
};

export default Topbar;
