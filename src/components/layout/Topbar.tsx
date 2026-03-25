import {
  Avatar,
  Badge,
  Box,
  Chip,
  Divider,
  IconButton,
  ListItemIcon,
  Menu,
  MenuItem,
  Stack,
  Typography,
} from "@mui/material";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import PersonOutlineOutlinedIcon from "@mui/icons-material/PersonOutlineOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import LogoutIcon from "@mui/icons-material/Logout";
import CheckIcon from "@mui/icons-material/Check";
import ViewSidebarOutlinedIcon from "@mui/icons-material/ViewSidebarOutlined";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import StarOutlinedIcon from "@mui/icons-material/StarOutlined";
import StarBorderOutlinedIcon from "@mui/icons-material/StarBorderOutlined";
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import PersonOutlinedIcon from "@mui/icons-material/PersonOutlined";
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useViewMode } from "../../contexts/ViewModeContext";
import { useFavoritesContext } from "../../contexts/FavoritesContext";
import { useWorkScope } from "../../hooks/useWorkScope";
import GlobalSearchDialog from "./GlobalSearchDialog";
import SyncStatusBadge from "../ui/SyncStatusBadge";
import strataLogo from "../../assets/strata_transparent.png";

function getRolesFromCache(): string[] {
  try {
    const raw = localStorage.getItem("admin_roles_config");
    if (raw) return Object.keys(JSON.parse(raw));
  } catch { /* ignore */ }
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
  "/settings": "Settings",
  "/profile": "Profile",
  "/issues": "Issues",
};

const Topbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { viewMode, toggleViewMode } = useViewMode();
  const { isFavorited, getFavorite, add, remove } = useFavoritesContext();
  const { isMyWork, isOfficeView, canUseOfficeView, setWorkScope } = useWorkScope();

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const menuOpen = Boolean(anchorEl);
  const [roleMenuAnchor, setRoleMenuAnchor] = useState<null | HTMLElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeOverride, setActiveOverride] = useState<string | null>(
    () => localStorage.getItem("dev_role_override")
  );

  // ── Role override listener ────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      setActiveOverride((e as CustomEvent<{ role: string | null }>).detail.role);
    };
    window.addEventListener("dev-role-override-changed", handler);
    return () => window.removeEventListener("dev-role-override-changed", handler);
  }, []);

  // ── Global search shortcut ────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── Favorites ─────────────────────────────────────────────────────────────
  const currentPath = location.pathname + location.search;
  const alreadyFavorited = isFavorited(currentPath);
  const pageLabel = ROUTE_LABELS[location.pathname] ?? location.pathname;

  const handleStarClick = () => {
    if (alreadyFavorited) {
      const existing = getFavorite(currentPath);
      if (existing) remove(existing.id);
    } else {
      add(pageLabel, currentPath);
    }
  };

  // ── User display ──────────────────────────────────────────────────────────
  const initials = useMemo(() => {
    const fullName = user?.fullName?.trim();
    if (fullName) {
      const parts = fullName.split(" ").filter(Boolean);
      return `${parts[0]?.[0] ?? "U"}${parts.length > 1 ? parts[parts.length - 1][0] : ""}`.toUpperCase();
    }
    return (user?.email?.slice(0, 2) ?? "U").toUpperCase();
  }, [user?.fullName, user?.email]);

  const displayRole = activeOverride ?? user?.role ?? "";
  const availableRoles = useMemo(() => getRolesFromCache(), []);

  const handleLogout = () => {
    ["auth_token","auth_user","local_auth_user","mock_role","mock_office","dev_role_override"]
      .forEach((k) => localStorage.removeItem(k));
    setAnchorEl(null);
    navigate("/login");
  };

  return (
    <Box className="topbar">

      {/* ── Mobile layout (≤ 768px): iOS-style bar ─────────────────────── */}
      <Box sx={{ display: { xs: "flex", md: "none" }, alignItems: "center", width: "100%", gap: 1 }}>
        {/* Logo */}
        <Box
          component="img"
          src={strataLogo}
          alt="Kinet"
          sx={{ height: 40, borderRadius: "8px", flexShrink: 0 }}
        />

        {/* App name + sync status + role */}
        <Stack spacing={0} sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" fontWeight={700} lineHeight={1.2} noWrap>
            Kinet
          </Typography>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            {/* Sync status replaces plain Online/Offline */}
            <SyncStatusBadge />
            {displayRole && (
              <>
                <Typography variant="caption" sx={{ fontSize: "0.72rem", color: "text.disabled" }}>·</Typography>
                <Typography variant="caption" sx={{ fontSize: "0.72rem", color: "text.secondary" }} noWrap>
                  {displayRole}
                </Typography>
              </>
            )}
            {isOfficeView && (
              <>
                <Typography variant="caption" sx={{ fontSize: "0.72rem", color: "text.disabled" }}>·</Typography>
                <Typography variant="caption" sx={{ fontSize: "0.72rem", color: "primary.main" }} noWrap>
                  (Office)
                </Typography>
              </>
            )}
          </Stack>
        </Stack>

        {/* Search */}
        <IconButton
          size="small"
          onClick={() => setSearchOpen(true)}
          sx={{ bgcolor: "action.hover", borderRadius: "50%", width: 38, height: 38 }}
        >
          <SearchOutlinedIcon fontSize="small" />
        </IconButton>

        {/* Tips & Tricks */}
        <IconButton
          size="small"
          onClick={() => navigate("/tips")}
          sx={{ bgcolor: "action.hover", borderRadius: "50%", width: 38, height: 38 }}
        >
          <LightbulbOutlinedIcon fontSize="small" sx={{ color: "#f59e0b" }} />
        </IconButton>

        {/* ··· menu */}
        <IconButton
          size="small"
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{
            bgcolor: "action.hover",
            borderRadius: "50%",
            width: 38,
            height: 38,
          }}
        >
          <Badge
            variant="dot"
            invisible={!activeOverride}
            sx={{ "& .MuiBadge-dot": { bgcolor: "warning.main" } }}
          >
            <MoreHorizIcon fontSize="small" />
          </Badge>
        </IconButton>
      </Box>

      {/* ── Desktop layout (≥ 768px): full bar ─────────────────────────── */}
      <Box sx={{ display: { xs: "none", md: "flex" }, alignItems: "center", width: "100%", gap: 2 }}>
        {/* Sidebar toggle + page title */}
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
              "&:hover": { background: "rgba(45, 212, 191, 0.28)" }
            }}
          />
          <Stack spacing={0.25}>
            <Typography variant="h5" sx={{ fontFamily: "Sora" }}>Kinet</Typography>
            <Typography variant="body2" color="text.secondary">{pageLabel}</Typography>
          </Stack>
        </Stack>

        <Box sx={{ flex: 1 }} />

        {/* Desktop actions */}
        <Stack direction="row" spacing={1} alignItems="center">
          <IconButton color="inherit" onClick={handleStarClick}>
            {alreadyFavorited
              ? <StarOutlinedIcon    sx={{ color: "#f59e0b" }} />
              : <StarBorderOutlinedIcon />}
          </IconButton>
          <IconButton color="inherit" onClick={() => setSearchOpen(true)}>
            <SearchOutlinedIcon />
          </IconButton>
          <IconButton color="inherit">
            <NotificationsNoneOutlinedIcon />
          </IconButton>
          <IconButton color="inherit" onClick={(e) => setAnchorEl(e.currentTarget)}>
            <Badge
              overlap="circular"
              anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
              variant="dot"
              invisible={!activeOverride}
              sx={{ "& .MuiBadge-dot": { backgroundColor: "#f59e0b", border: "2px solid var(--panel)", width: 10, height: 10, borderRadius: "50%" } }}
            >
              <Avatar sx={{ bgcolor: "#2dd4bf", color: "#0b1d24", width: 32, height: 32, fontSize: 13 }}>
                {initials}
              </Avatar>
            </Badge>
          </IconButton>
        </Stack>
      </Box>

      {/* ── Shared menu (mobile + desktop) ──────────────────────────────── */}
      <Menu
        anchorEl={anchorEl}
        open={menuOpen}
        onClose={() => { setAnchorEl(null); setRoleMenuAnchor(null); }}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { minWidth: 200, borderRadius: 2 } } }}
      >
        {/* User info header */}
        <MenuItem disabled>
          <Stack>
            <Typography variant="body2" fontWeight={600}>{user?.fullName || "User"}</Typography>
            <Typography variant="caption" color="text.secondary">{displayRole}</Typography>
          </Stack>
        </MenuItem>
        <Divider />

        {/* Profile */}
        <MenuItem onClick={() => { setAnchorEl(null); navigate("/profile"); }}>
          <ListItemIcon><PersonOutlineOutlinedIcon fontSize="small" /></ListItemIcon>
          <Typography variant="body2">Profile</Typography>
        </MenuItem>

        {/* Work scope toggle */}
        {canUseOfficeView && (
          <>
            <MenuItem onClick={() => { setWorkScope(isMyWork ? "office" : "my-work"); setAnchorEl(null); }}>
              <ListItemIcon>
                {isMyWork ? <BusinessOutlinedIcon fontSize="small" /> : <PersonOutlinedIcon fontSize="small" />}
              </ListItemIcon>
              <Typography variant="body2">
                {isMyWork ? "Switch to Office View" : "Switch to My Work"}
              </Typography>
            </MenuItem>
            <Divider />
          </>
        )}

        {/* Test as role → submenu */}
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

        {/* Refresh */}
        <MenuItem onClick={() => { setAnchorEl(null); window.location.reload(); }}>
          <ListItemIcon><RefreshOutlinedIcon fontSize="small" /></ListItemIcon>
          <Typography variant="body2">Refresh</Typography>
        </MenuItem>

        <Divider />

        {/* Sign out */}
        <MenuItem onClick={handleLogout} sx={{ color: "error.main" }}>
          <ListItemIcon><LogoutIcon fontSize="small" sx={{ color: "error.main" }} /></ListItemIcon>
          <Typography variant="body2">Sign Out</Typography>
        </MenuItem>
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
            onClick={() => { setDevRoleOverride(role); setAnchorEl(null); setRoleMenuAnchor(null); }}
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
            <MenuItem dense onClick={() => { setDevRoleOverride(null); setAnchorEl(null); setRoleMenuAnchor(null); }}>
              <Typography variant="body2" color="text.secondary">Clear role test</Typography>
            </MenuItem>
          </>
        )}
      </Menu>

      <GlobalSearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </Box>
  );
};

export default Topbar;
