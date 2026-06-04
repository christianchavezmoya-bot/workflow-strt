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
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import AdminPanelSettingsOutlinedIcon from "@mui/icons-material/AdminPanelSettingsOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import PersonOutlineOutlinedIcon from "@mui/icons-material/PersonOutlineOutlined";
import TableChartOutlinedIcon from "@mui/icons-material/TableChartOutlined";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import { NavLink } from "react-router-dom";
import { useActiveOffice } from "../../hooks/useActiveOffice";
import { useAuth } from "../../hooks/useAuth";
import { usePermissions } from "../../hooks/usePermissions";
import { officesService } from "../../services/officesService";
import { brandSettingsService } from "../../services/brandSettingsService";
import type { Office } from "../../components/GlobalOfficeMap";
import strataLogo from "../../assets/strata_transparent.png";
import FavoritesSection from "./FavoritesSection";
import { BOM_MODULE_ENABLED } from "../../modules/bom-project";

const navItems = [
  { label: "Dashboard",         icon: <DashboardOutlinedIcon />,          to: "/",                      end: true,  tourKey: "nav-dashboard" },
  { label: "Projects",          icon: <AssignmentOutlinedIcon />,         to: "/projects",                          tourKey: "nav-projects" },
  { label: "Issues Board",      icon: <ErrorOutlineOutlinedIcon />,       to: "/issues",                            tourKey: "nav-issues" },
  { label: "Assets",            icon: <TableChartOutlinedIcon />,         to: "/installations/assets",              tourKey: "nav-installations" },
  { label: "Work Instructions", icon: <MenuBookOutlinedIcon />,           to: "/work-instructions",                 tourKey: "nav-work-instructions" },
  { label: "Documents",         icon: <FolderOutlinedIcon />,             to: "/documents",                         tourKey: "nav-documents" },
  { label: "Tips & Tricks",     icon: <LightbulbOutlinedIcon />,          to: "/tips",                              tourKey: "nav-tips" },
  ...(BOM_MODULE_ENABLED ? [{ label: "BOM to Project", icon: <AccountTreeOutlinedIcon />, to: "/admin/bom-project", tourKey: "nav-bom" }] : []),
  { label: "Admin",             icon: <AdminPanelSettingsOutlinedIcon />, to: "/admin",                 end: true,  tourKey: "nav-admin" },
  { label: "Settings",          icon: <SettingsOutlinedIcon />,           to: "/settings",                          tourKey: "nav-settings" },
  { label: "Profile",           icon: <PersonOutlineOutlinedIcon />,      to: "/profile",                           tourKey: "nav-profile" },
];

const Sidebar = () => {
  const { user } = useAuth();
  const can = usePermissions();
  const { activeOffice, updateActiveOffice } = useActiveOffice();
  const visibleNavItems = navItems.filter((item) => {
    if (item.to === "/settings" && can.viewOnly) return false;
    return true;
  });
  const [officeOptions, setOfficeOptions] = useState<string[]>(["All"]);
  const [appName, setAppName] = useState("Field Operations");

  useEffect(() => {
    brandSettingsService.get().then((s) => {
      if (s.appName) setAppName(s.appName);
    }).catch(() => {});

    const handleBrandUpdate = (e: Event) => {
      const name = (e as CustomEvent<{ appName: string }>).detail?.appName;
      if (name) setAppName(name);
    };
    window.addEventListener("brand-name-changed", handleBrandUpdate);
    return () => window.removeEventListener("brand-name-changed", handleBrandUpdate);
  }, []);

  useEffect(() => {
    officesService.getAll().then((offices: Office[]) => {
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
          {appName && (
            <Typography variant="caption" color="text.disabled" sx={{ display: "block", fontSize: "0.65rem" }}>
              {appName}
            </Typography>
          )}
        </Box>
        <Divider sx={{ borderColor: "rgba(255,255,255,0.08)" }} />
      </Stack>
      <FavoritesSection />
      <List sx={{ display: "flex", flexDirection: "column", gap: 0.5 }} data-tour="nav-sidebar">
        {visibleNavItems.map((item) => (
          <ListItemButton
            key={item.label}
            component={NavLink}
            to={item.to}
            end={item.end}
            data-tour={item.tourKey}
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
