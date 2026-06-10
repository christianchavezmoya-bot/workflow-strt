import { Avatar, Badge, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControl, IconButton, InputAdornment, InputLabel, ListItemIcon, Menu, MenuItem, Popover, Select, Stack, Tab, Tabs, TextField, Tooltip, Typography } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import SwitchAccountOutlinedIcon from "@mui/icons-material/SwitchAccountOutlined";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import HelpOutlineOutlinedIcon from "@mui/icons-material/HelpOutlineOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import ViewSidebarOutlinedIcon from "@mui/icons-material/ViewSidebarOutlined";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import CheckIcon from "@mui/icons-material/Check";
import StarOutlinedIcon from "@mui/icons-material/StarOutlined";
import StarBorderOutlinedIcon from "@mui/icons-material/StarBorderOutlined";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { useAuth } from "../../hooks/useAuth";
import { useNotificationInbox } from "../../contexts/NotificationInboxContext";
import { useComplexView } from "../../contexts/ComplexViewContext";
import { useViewMode } from "../../contexts/ViewModeContext";
import { useFavoritesContext } from "../../contexts/FavoritesContext";
import { useAppSelector } from "../../store/hooks";
import GlobalSearchDialog from "./GlobalSearchDialog";
import { searchIndexService, type SearchIndexStatus } from "../../services/searchIndexService";
import { brandSettingsService } from "../../services/brandSettingsService";
import { secureClearAuth } from "../../services/secureStorage";
import strataLogo from "../../assets/strata_transparent.png";

function getRolesFromCache(): string[] {
  try {
    const raw = localStorage.getItem("admin_roles_config");
    if (raw) return Object.keys(JSON.parse(raw));
  } catch {
    // ignore
  }
  return ["Admin", "Project Manager", "Engineer", "Viewer"];
}

function setDevRoleOverride(role: string | null) {
  if (role) {
    localStorage.setItem("dev_role_override", role);
  } else {
    localStorage.removeItem("dev_role_override");
  }
  window.dispatchEvent(new CustomEvent("dev-role-override-changed", { detail: { role } }));
}

const ROUTE_LABELS: Record<string, string> = {
  "/": "Dashboard",
  "/projects": "Projects",
  "/installations/assets": "Assets",
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
  const { complexViewActive, recordLogoTap } = useComplexView();
  const { viewMode, toggleViewMode } = useViewMode();
  const { isFavorited, getFavorite, add, remove } = useFavoritesContext();
  const products = useAppSelector((s) => s.products.items);
  const projects = useAppSelector((s) => s.projects.items);
  const isNativePlatform = Capacitor.isNativePlatform();

  const [appName, setAppName] = useState("Field Operations");
  const [qbEnabled, setQbEnabled] = useState(false);
  const [qbHost, setQbHost] = useState("");

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

  const isAdminUser = useMemo(() => /admin/i.test(user?.role ?? ""), [user?.role]);

  useEffect(() => {
    if (!isAdminUser) return;
    import("../../services/settingsService").then(({ settingsService }) => {
      settingsService.getQuickbaseSettings().then((s) => {
        setQbEnabled(!!s?.enabled);
        setQbHost(s?.realmHostname ?? "");
      }).catch(() => {});
    });
  }, [isAdminUser]);

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [notificationsAnchor, setNotificationsAnchor] = useState<null | HTMLElement>(null);
  const menuOpen = Boolean(anchorEl);
  const [roleMenuAnchor, setRoleMenuAnchor] = useState<null | HTMLElement>(null);
  const [notificationView, setNotificationView] = useState<"unread" | "history">("unread");
  const [notificationTypeFilter, setNotificationTypeFilter] = useState("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [indexStatus, setIndexStatus] = useState<SearchIndexStatus | null>(null);
  const [indexLoading, setIndexLoading] = useState(false);
  const [indexPopoverAnchor, setIndexPopoverAnchor] = useState<null | HTMLElement>(null);
  const isNotificationsOpen = Boolean(notificationsAnchor);

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

  const notificationGroup = (eventType: string) => {
    if (eventType.includes("assign")) return "assignments";
    if (eventType.includes("reminder")) return "reminders";
    if (eventType.includes("media")) return "media";
    if (eventType.includes("issue")) return "issues";
    return "workflow";
  };

  const notificationColor = (severity: string): "success" | "warning" | "error" | "info" => {
    if (severity === "success") return "success";
    if (severity === "warning") return "warning";
    if (severity === "error") return "error";
    return "info";
  };

  const visibleNotifications = useMemo(() => {
    const source = notificationView === "unread" ? unreadNotifications : notifications;
    return source.filter((notification) =>
      notificationTypeFilter === "all" || notificationGroup(notification.eventType) === notificationTypeFilter
    );
  }, [notificationTypeFilter, notificationView, notifications, unreadNotifications]);

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

  const [activeOverride, setActiveOverride] = useState<string | null>(
    () => localStorage.getItem("dev_role_override")
  );
  useEffect(() => {
    function handleRoleChange(e: Event) {
      setActiveOverride((e as CustomEvent<{ role: string | null }>).detail.role);
    }
    window.addEventListener("dev-role-override-changed", handleRoleChange);
    return () => window.removeEventListener("dev-role-override-changed", handleRoleChange);
  }, []);

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
    setRoleMenuAnchor(null);
  };

  const handleLogout = async () => {
    await secureClearAuth();
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    localStorage.removeItem("local_auth_user");
    localStorage.removeItem("mock_role");
    localStorage.removeItem("mock_office");
    localStorage.removeItem("dev_role_override");
    handleClose();
    navigate("/login");
  };

  const availableRoles = useMemo(() => getRolesFromCache(), []);

  // ── Test-as-user switcher ─────────────────────────────────────────────────
  const [testUserDialogOpen, setTestUserDialogOpen] = useState(false);
  const [testUserSearch, setTestUserSearch] = useState("");
  const [testUserList, setTestUserList] = useState<{ id: string; fullName: string; email: string; role: string }[]>([]);
  const [testUserLoading, setTestUserLoading] = useState(false);
  const isTestMode = !!localStorage.getItem("test_mode_original_auth");
  const testModeName = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("auth_user") ?? "")?.fullName ?? null; } catch { return null; }
  }, []);

  function openTestUserDialog() {
    handleClose();
    setTestUserSearch("");
    setTestUserDialogOpen(true);
    if (testUserList.length === 0) {
      setTestUserLoading(true);
      import("../../services/api").then(({ default: api }) =>
        api.get("/users").then((res) => {
          setTestUserList((res.data as any[]).map((u: any) => ({
            id: u.id, fullName: u.fullName, email: u.email, role: u.role,
          })));
        }).catch(() => {}).finally(() => setTestUserLoading(false))
      );
    }
  }

  function activateTestUser(u: { id: string; fullName: string; email: string; role: string }) {
    // Save original session so we can restore it
    if (!localStorage.getItem("test_mode_original_auth")) {
      const original = localStorage.getItem("auth_user") || localStorage.getItem("local_auth_user");
      if (original) localStorage.setItem("test_mode_original_auth", original);
    }
    const testUser = { id: u.id, fullName: u.fullName, email: u.email, role: u.role, isActive: true, isFirstLogin: false, office: "" };
    localStorage.setItem("auth_user", JSON.stringify(testUser));
    localStorage.removeItem("dev_role_override");
    window.dispatchEvent(new CustomEvent("dev-role-override-changed", { detail: { role: null } }));
    window.dispatchEvent(new Event("auth-user-updated"));
    setTestUserDialogOpen(false);
  }

  function exitTestMode() {
    const original = localStorage.getItem("test_mode_original_auth");
    if (original) {
      localStorage.setItem("auth_user", original);
      localStorage.removeItem("test_mode_original_auth");
      localStorage.removeItem("dev_role_override");
      window.dispatchEvent(new CustomEvent("dev-role-override-changed", { detail: { role: null } }));
      window.dispatchEvent(new Event("auth-user-updated"));
    }
  }

  const filteredTestUsers = useMemo(() =>
    testUserList.filter(u =>
      u.fullName.toLowerCase().includes(testUserSearch.toLowerCase()) ||
      u.role.toLowerCase().includes(testUserSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(testUserSearch.toLowerCase())
    ), [testUserList, testUserSearch]);

  return (
    <Box className="topbar">
      <Stack direction="row" spacing={2} alignItems="center">
        {isNativePlatform ? (
          <Box
            component="img"
            src={strataLogo}
            alt="Business Logo"
            onClick={() => recordLogoTap(user?.role ?? "")}
            sx={{
              height: 52, maxWidth: 180, objectFit: "contain", userSelect: "none",
              cursor: "pointer",
              outline: complexViewActive ? "2px solid rgba(45,212,191,0.7)" : "2px solid transparent",
              borderRadius: 1,
              transition: "outline 0.2s",
            }}
          />
        ) : (
          <>
            <Chip
              icon={viewMode === "full" ? <ViewSidebarOutlinedIcon /> : <DashboardOutlinedIcon />}
              label={viewMode === "full" ? "Full View" : "Minimal View"}
              onClick={toggleViewMode}
              sx={{
                background: "rgba(45, 212, 191, 0.18)",
                color: "#9df0e5",
                border: "1px solid rgba(45, 212, 191, 0.3)",
                cursor: "pointer",
                "&:hover": { background: "rgba(45, 212, 191, 0.28)" }
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
          </>
        )}
      </Stack>
      <Stack direction="row" spacing={isNativePlatform ? 0.5 : 2} alignItems="center">
        {!isNativePlatform && qbEnabled && (() => {
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
        {!isNativePlatform && isAdminUser && (
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
        {!isNativePlatform && (
          <Tooltip title={alreadyFavorited ? "Remove from Favorites" : "Add to Favorites"}>
            <IconButton color="inherit" onClick={handleStarClick}>
              {alreadyFavorited
                ? <StarOutlinedIcon sx={{ color: "#f59e0b" }} />
                : <StarBorderOutlinedIcon />}
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title="Help & tours">
          <IconButton color="inherit" onClick={() => window.dispatchEvent(new CustomEvent("open-help-drawer"))}>
            <HelpOutlineOutlinedIcon />
          </IconButton>
        </Tooltip>

        {/* Add-favorite popover */}
        {!isNativePlatform && (
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
        )}

        <IconButton color="inherit" onClick={() => setSearchOpen(true)}>
          <SearchOutlinedIcon />
        </IconButton>
        <IconButton color="inherit" onClick={(e) => setNotificationsAnchor(e.currentTarget)}>
          <Badge
            badgeContent={unreadNotifications.length}
            color="warning"
            invisible={unreadNotifications.length === 0}
          >
            <NotificationsNoneOutlinedIcon />
          </Badge>
        </IconButton>
        <Popover
          open={isNotificationsOpen}
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
                      color={notificationColor(notification.severity)}
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
          <Badge
            overlap="circular"
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            variant="dot"
            invisible={!activeOverride}
            sx={{
              "& .MuiBadge-dot": {
                backgroundColor: "#f59e0b",
                border: "2px solid var(--panel)",
                width: 10,
                height: 10,
                borderRadius: "50%"
              }
            }}
          >
            <Avatar sx={{ bgcolor: "#2dd4bf", color: "#0b1d24" }}>{initials}</Avatar>
          </Badge>
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
          <MenuItem onClick={openTestUserDialog} sx={{ justifyContent: "space-between" }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <SwitchAccountOutlinedIcon fontSize="small" sx={{ color: "text.secondary" }} />
              <Typography variant="body2">Test as user…</Typography>
            </Stack>
            {isTestMode && (
              <Typography variant="caption" color="warning.main" sx={{ ml: 1 }} noWrap>
                {testModeName}
              </Typography>
            )}
          </MenuItem>
          {isTestMode && (
            <MenuItem onClick={() => { exitTestMode(); handleClose(); }}>
              <Typography variant="body2" color="warning.main">Exit test mode</Typography>
            </MenuItem>
          )}
          <MenuItem
            onClick={(e) => setRoleMenuAnchor(e.currentTarget)}
            sx={{ justifyContent: "space-between" }}
          >
            <Typography variant="body2">Test as role…</Typography>
            {activeOverride && (
              <Typography variant="caption" color="warning.main" sx={{ ml: 1 }}>
                {activeOverride}
              </Typography>
            )}
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

        {/* Role switcher submenu */}
        <Menu
          anchorEl={roleMenuAnchor}
          open={Boolean(roleMenuAnchor)}
          onClose={() => setRoleMenuAnchor(null)}
          anchorOrigin={{ vertical: "top", horizontal: "left" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
        >
          {availableRoles.map((role) => (
            <MenuItem
              key={role}
              dense
              onClick={() => {
                setDevRoleOverride(role);
                handleClose();
              }}
            >
              <ListItemIcon sx={{ minWidth: 28 }}>
                {activeOverride === role && <CheckIcon fontSize="small" sx={{ color: "warning.main" }} />}
              </ListItemIcon>
              <Typography variant="body2">{role}</Typography>
            </MenuItem>
          ))}
          {activeOverride && (
            <>
              <Divider />
              <MenuItem
                dense
                onClick={() => {
                  setDevRoleOverride(null);
                  handleClose();
                }}
              >
                <Typography variant="body2" color="text.secondary">Clear role test</Typography>
              </MenuItem>
            </>
          )}
        </Menu>
      </Stack>
      {/* Test mode banner */}
      {isTestMode && (
        <Box sx={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999,
          bgcolor: "warning.main", color: "warning.contrastText",
          px: 2, py: 0.5, display: "flex", alignItems: "center", justifyContent: "center", gap: 2,
        }}>
          <SwitchAccountOutlinedIcon sx={{ fontSize: 16 }} />
          <Typography variant="caption" fontWeight={700}>
            TEST MODE — viewing as {testModeName}
          </Typography>
          <Button size="small" variant="outlined"
            sx={{ color: "warning.contrastText", borderColor: "warning.contrastText", py: 0, fontSize: "0.7rem" }}
            onClick={exitTestMode}>
            Exit
          </Button>
        </Box>
      )}

      {/* Test-as-user picker dialog */}
      <Dialog open={testUserDialogOpen} onClose={() => setTestUserDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Test as user</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField
              size="small" fullWidth autoFocus
              placeholder="Search by name, role or email…"
              InputLabelProps={{ shrink: true }}
              value={testUserSearch}
              onChange={(e) => setTestUserSearch(e.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
            />
            {testUserLoading ? (
              <Stack alignItems="center" py={2}><CircularProgress size={24} /></Stack>
            ) : filteredTestUsers.length === 0 ? (
              <Typography variant="caption" color="text.disabled">No users found.</Typography>
            ) : (
              <Stack spacing={0.5} sx={{ maxHeight: 320, overflowY: "auto" }}>
                {filteredTestUsers.map((u) => (
                  <Box key={u.id}
                    onClick={() => activateTestUser(u)}
                    sx={{
                      px: 1.5, py: 1, borderRadius: 1, cursor: "pointer", border: "1px solid",
                      borderColor: "divider",
                      "&:hover": { bgcolor: "rgba(45,212,191,0.08)", borderColor: "primary.main" },
                    }}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                      <Box>
                        <Typography variant="body2" fontWeight={600}>{u.fullName}</Typography>
                        <Typography variant="caption" color="text.secondary">{u.email}</Typography>
                      </Box>
                      <Chip label={u.role} size="small" variant="outlined" sx={{ fontSize: "0.65rem", height: 20 }} />
                    </Stack>
                  </Box>
                ))}
              </Stack>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          {isTestMode && (
            <Button color="warning" onClick={() => { exitTestMode(); setTestUserDialogOpen(false); }}>
              Exit test mode
            </Button>
          )}
          <Button onClick={() => setTestUserDialogOpen(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>

      <GlobalSearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </Box>
  );
};

export default Topbar;
