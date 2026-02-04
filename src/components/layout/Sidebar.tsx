import {
  Box,
  Divider,
  FormControl,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  Typography
} from "@mui/material";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import AdminPanelSettingsOutlinedIcon from "@mui/icons-material/AdminPanelSettingsOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import PersonOutlineOutlinedIcon from "@mui/icons-material/PersonOutlineOutlined";
import { NavLink } from "react-router-dom";
import { useActiveOffice } from "../../hooks/useActiveOffice";
import { useAuth } from "../../hooks/useAuth";
import strataLogo from "../../assets/strata_transparent.png";

const navItems = [
  { label: "Dashboard", icon: <DashboardOutlinedIcon />, to: "/" },
  { label: "Projects", icon: <AssignmentOutlinedIcon />, to: "/projects" },
  { label: "Installations", icon: <AccountTreeOutlinedIcon />, to: "/installations" },
  { label: "Admin", icon: <AdminPanelSettingsOutlinedIcon />, to: "/admin" },
  { label: "Settings", icon: <SettingsOutlinedIcon />, to: "/settings" },
  { label: "Profile", icon: <PersonOutlineOutlinedIcon />, to: "/profile" }
];

const officeOptions = ["USA", "Australia", "South Africa", "All"] as const;

const Sidebar = () => {
  const { user } = useAuth();
  const { activeOffice, updateActiveOffice } = useActiveOffice();

  return (
    <Box className="sidebar">
      <Box className="brand">
        <img className="brand-logo" src={strataLogo} alt="Strata Worldwide" />
      </Box>
      <Stack spacing={2}>
        <Box className="glass-card" sx={{ padding: "12px 14px" }}>
          <Typography variant="caption" color="text.secondary">
            Active office
          </Typography>
          <FormControl size="small" fullWidth>
            <Select value={activeOffice} onChange={(event) => updateActiveOffice(event.target.value as typeof activeOffice)}>
              {officeOptions.map((office) => (
                <MenuItem key={office} value={office}>
                  {office}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Typography variant="caption" color="text.secondary" sx={{ marginTop: 1, display: "block" }}>
            Signed in as {user?.fullName || "Local User"}
          </Typography>
        </Box>
        <Divider sx={{ borderColor: "rgba(255,255,255,0.08)" }} />
      </Stack>
      <List sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
        {navItems.map((item) => (
          <ListItemButton
            key={item.label}
            component={NavLink}
            to={item.to}
            sx={{
              borderRadius: 2,
              color: "text.primary",
              "&.active": {
                background: "rgba(45, 212, 191, 0.18)",
                color: "#eafaf7"
              }
            }}
          >
            <ListItemIcon sx={{ color: "inherit" }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );
};

export default Sidebar;
