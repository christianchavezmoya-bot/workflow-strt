import { Avatar, Badge, Box, Button, CircularProgress, Divider, IconButton, ListItemIcon, Menu, MenuItem, Popover, Stack, TextField, Tooltip, Typography, Chip } from "@mui/material";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import ViewSidebarOutlinedIcon from "@mui/icons-material/ViewSidebarOutlined";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import CheckIcon from "@mui/icons-material/Check";
import StarOutlinedIcon from "@mui/icons-material/StarOutlined";
import StarBorderOutlinedIcon from "@mui/icons-material/StarBorderOutlined";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useViewMode } from "../../contexts/ViewModeContext";
import { useFavoritesContext } from "../../contexts/FavoritesContext";
import { useAppSelector } from "../../store/hooks";
import GlobalSearchDialog from "./GlobalSearchDialog";
import { searchIndexService, type SearchIndexStatus } from "../../services/searchIndexService";

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
  quickbase: "Quickbase",
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
  const { viewMode, toggleViewMode } = useViewMode();
  const { isFavorited, getFavorite, add, remove } = useFavoritesContext();
  const products = useAppSelector((s) => s.products.items);
  const projects = useAppSelector((s) => s.projects.items);

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const menuOpen = Boolean(anchorEl);
  const [roleMenuAnchor, setRoleMenuAnchor] = useState<null | HTMLElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [indexStatus, setIndexStatus] = useState<SearchIndexStatus | null>(null);
  const [indexLoading, setIndexLoading] = useState(false);
  const [indexPopoverAnchor, setIndexPopoverAnchor] = useState<null | HTMLElement>(null);
  const isAdminUser = useMemo(() => /admin/i.test(user?.role ?? ""), [user?.role]);

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

  const handleLogout = () => {
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
            Global Project Workflow
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {autoLabel}
          </Typography>
        </Stack>
      </Stack>
      <Stack direction="row" spacing={2} alignItems="center">
        <Box className="status-chip">
          <span className="status-dot" />
          Quickbase connected
        </Box>
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
        <IconButton color="inherit">
          <NotificationsNoneOutlinedIcon />
        </IconButton>
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
      <GlobalSearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </Box>
  );
};

export default Topbar;
