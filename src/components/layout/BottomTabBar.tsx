import { BottomNavigation, BottomNavigationAction, Box } from "@mui/material";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import TableChartOutlinedIcon from "@mui/icons-material/TableChartOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import MenuOutlinedIcon from "@mui/icons-material/MenuOutlined";
import { useLocation, useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import {
  Divider,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
} from "@mui/material";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined";
import AdminPanelSettingsOutlinedIcon from "@mui/icons-material/AdminPanelSettingsOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import PersonOutlineOutlinedIcon from "@mui/icons-material/PersonOutlineOutlined";
import { NavLink } from "react-router-dom";

const PRIMARY_TABS = [
  { label: "Home",      icon: <HomeOutlinedIcon />,           path: "/" },
  { label: "Projects",  icon: <AssignmentOutlinedIcon />,     path: "/projects" },
  { label: "Installs",  icon: <TableChartOutlinedIcon />,     path: "/installations/assets" },
  { label: "Issues",    icon: <ErrorOutlineOutlinedIcon />,   path: "/issues" },
  { label: "More",      icon: <MenuOutlinedIcon />,           path: "__more__" },
];

const MORE_ITEMS = [
  { label: "Work Instructions", icon: <MenuBookOutlinedIcon />,           to: "/work-instructions" },
  { label: "Documents",         icon: <FolderOutlinedIcon />,             to: "/documents" },
  { label: "Tips & Tricks",     icon: <LightbulbOutlinedIcon />,          to: "/tips" },
  { label: "Admin",             icon: <AdminPanelSettingsOutlinedIcon />, to: "/admin" },
  { label: "Settings",          icon: <SettingsOutlinedIcon />,           to: "/settings" },
  { label: "Profile",           icon: <PersonOutlineOutlinedIcon />,      to: "/profile" },
];

const BottomTabBar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  const value = useMemo(() => {
    const idx = PRIMARY_TABS.findIndex(
      (t) =>
        t.path !== "__more__" &&
        (t.path === "/"
          ? location.pathname === "/"
          : location.pathname.startsWith(t.path))
    );
    return idx >= 0 ? idx : 0;
  }, [location.pathname]);

  const handleChange = (_: React.SyntheticEvent, newValue: number) => {
    const tab = PRIMARY_TABS[newValue];
    if (tab.path === "__more__") {
      setMoreOpen(true);
    } else {
      navigate(tab.path);
    }
  };

  return (
    <>
      <Box
        className="bottom-tab-bar"
        sx={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 200,
          borderTop: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
          pb: "env(safe-area-inset-bottom)",
        }}
      >
        <BottomNavigation
          value={value}
          onChange={handleChange}
          showLabels
          sx={{
            bgcolor: "background.paper",
            height: 60,
            "& .MuiBottomNavigationAction-root": {
              minWidth: 0,
              padding: "6px 4px",
              color: "text.secondary",
            },
            "& .MuiBottomNavigationAction-label": {
              fontSize: "0.62rem",
              fontWeight: 500,
              mt: "2px",
            },
            "& .Mui-selected": {
              color: "primary.main",
            },
            "& .Mui-selected .MuiBottomNavigationAction-label": {
              fontSize: "0.62rem",
              fontWeight: 600,
            },
          }}
        >
          {PRIMARY_TABS.map((tab) => (
            <BottomNavigationAction
              key={tab.path}
              label={tab.label}
              icon={tab.icon}
            />
          ))}
        </BottomNavigation>
      </Box>

      {/* "More" drawer — slides up from bottom */}
      <Drawer
        anchor="bottom"
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        PaperProps={{
          sx: {
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            pb: "env(safe-area-inset-bottom)",
          },
        }}
      >
        <Box sx={{ px: 2, pt: 2, pb: 1 }}>
          <Box
            sx={{
              width: 36,
              height: 4,
              borderRadius: 2,
              bgcolor: "divider",
              mx: "auto",
              mb: 2,
            }}
          />
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
            More
          </Typography>
          <Divider />
          <List disablePadding sx={{ mt: 1 }}>
            {MORE_ITEMS.map((item) => (
              <ListItemButton
                key={item.to}
                component={NavLink}
                to={item.to}
                onClick={() => setMoreOpen(false)}
                sx={{
                  borderRadius: 2,
                  mb: 0.5,
                  "&.active": {
                    bgcolor: "primary.50",
                    color: "primary.main",
                    "& .MuiListItemIcon-root": { color: "primary.main" },
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 40, color: "text.secondary" }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{ variant: "body2", fontWeight: 500 }}
                />
              </ListItemButton>
            ))}
          </List>
        </Box>
      </Drawer>
    </>
  );
};

export default BottomTabBar;
