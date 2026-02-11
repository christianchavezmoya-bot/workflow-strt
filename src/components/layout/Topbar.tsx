import { Avatar, Box, IconButton, Menu, MenuItem, Stack, Typography, Chip } from "@mui/material";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import ViewSidebarOutlinedIcon from "@mui/icons-material/ViewSidebarOutlined";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useViewMode } from "../../contexts/ViewModeContext";

const Topbar = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { viewMode, toggleViewMode } = useViewMode();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const menuOpen = Boolean(anchorEl);
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
    handleClose();
    navigate("/login");
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
          <Avatar sx={{ bgcolor: "#2dd4bf", color: "#0b1d24" }}>{initials}</Avatar>
        </IconButton>
        <Menu
          anchorEl={anchorEl}
          open={menuOpen}
          onClose={handleClose}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
        >
          <MenuItem disabled>
            {user?.fullName || "User"} {user?.role ? `(${user.role})` : ""}
          </MenuItem>
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
    </Box>
  );
};

export default Topbar;
