import { useEffect, useState } from "react";
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
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import AdminPanelSettingsOutlinedIcon from "@mui/icons-material/AdminPanelSettingsOutlined";
import InventoryOutlinedIcon from "@mui/icons-material/InventoryOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import PersonOutlineOutlinedIcon from "@mui/icons-material/PersonOutlineOutlined";
import TableChartOutlinedIcon from "@mui/icons-material/TableChartOutlined";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import { NavLink } from "react-router-dom";
import { useActiveOffice } from "../../hooks/useActiveOffice";
import { useAuth } from "../../hooks/useAuth";
import { usePermissions } from "../../hooks/usePermissions";
import { officesService } from "../../services/officesService";
import type { Office } from "../../components/GlobalOfficeMap";
import strataLogo from "../../assets/strata_transparent.png";
import FavoritesSection from "./FavoritesSection";

const navItems = [
  { label: "Dashboard",       icon: <DashboardOutlinedIcon />,            to: "/" },
  { label: "Projects",        icon: <AssignmentOutlinedIcon />,           to: "/projects" },
  { label: "Installations",   icon: <TableChartOutlinedIcon />,           to: "/installations/assets" },
  { label: "Work Instructions", icon: <MenuBookOutlinedIcon />,           to: "/work-instructions" },
  { label: "Documents",       icon: <FolderOutlinedIcon />,               to: "/documents" },
  { label: "Dispatch",        icon: <LocalShippingOutlinedIcon />,        to: "/dispatch" },
  { label: "Asset Registry",  icon: <InventoryOutlinedIcon />,            to: "/admin/asset-registry" },
  { label: "Admin",           icon: <AdminPanelSettingsOutlinedIcon />,   to: "/admin" },
  { label: "Settings",        icon: <SettingsOutlinedIcon />,             to: "/settings" },
  { label: "Profile",         icon: <PersonOutlineOutlinedIcon />,        to: "/profile" },
];

const Sidebar = () => {
  const { user } = useAuth();
  const can = usePermissions();
  const { activeOffice, updateActiveOffice } = useActiveOffice();
  const visibleNavItems = navItems.filter((item) => {
    if (item.to === "/settings" && can.viewOnly) return false;
    return true;
  });
  const [globalOffices, setGlobalOffices] = useState<Office[]>([]);
  const [officeOptions, setOfficeOptions] = useState<string[]>(["All"]);

  useEffect(() => {
    officesService.getAll().then((offices) => {
      setGlobalOffices(offices);
      // Extract unique countries from global offices
      const countries = Array.from(new Set(offices.map((office) => office.country).filter(Boolean)));
      setOfficeOptions([...countries.sort(), "All"]);
    });
  }, []);

  return (
    <Box className="sidebar">
      <Box className="brand">
        <img className="brand-logo" src={strataLogo} alt="Strata Worldwide" />
      </Box>
      <Stack spacing={2}>
        <Box className="glass-card" sx={{ padding: "12px 14px" }}>
          <Typography variant="caption" color="text.secondary">
            Active global office
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
      <FavoritesSection />
      <List sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
        {visibleNavItems.map((item) => (
          <ListItemButton
            key={item.label}
            component={NavLink}
            to={item.to}
            onClick={() => {
              window.dispatchEvent(new CustomEvent("app:side-nav-click"));
            }}
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
