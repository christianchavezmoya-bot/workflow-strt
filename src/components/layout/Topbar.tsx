import { Avatar, Badge, Box, Divider, IconButton, ListItemIcon, Menu, MenuItem, Stack, Typography, Chip } from "@mui/material";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import ViewSidebarOutlinedIcon from "@mui/icons-material/ViewSidebarOutlined";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import CheckIcon from "@mui/icons-material/Check";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useViewMode } from "../../contexts/ViewModeContext";

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

const Topbar = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { viewMode, toggleViewMode } = useViewMode();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const menuOpen = Boolean(anchorEl);
  const [roleMenuAnchor, setRoleMenuAnchor] = useState<null | HTMLElement>(null);

  const activeOverride = localStorage.getItem("dev_role_override");

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

  const availableRoles = getRolesFromCache();

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
            Coordinate internal and external installations across offices.
          </Typography>
        </Stack>
      </Stack>
      <Stack direction="row" spacing={2} alignItems="center">
        <Box className="status-chip">
          <span className="status-dot" />
          Quickbase connected
        </Box>
        <IconButton color="inherit">
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
    </Box>
  );
};

export default Topbar;
