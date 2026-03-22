import { useState } from "react";
import { Box, Paper, Tab, Tabs } from "@mui/material";
import ProjectList from "./ProjectList";
import AssetRegistryPage from "../admin/AssetRegistryPage";
import DispatchBoardPage from "../dispatch/DispatchBoardPage";

const TABS = ["Projects", "Asset Registry", "Dispatch History"] as const;

export default function ProjectsPage() {
  const [tab, setTab] = useState(() => {
    const idx = parseInt(localStorage.getItem("projects_active_tab") ?? "0");
    return isNaN(idx) ? 0 : Math.min(idx, TABS.length - 1);
  });

  const handleChange = (_: React.SyntheticEvent, next: number) => {
    setTab(next);
    localStorage.setItem("projects_active_tab", String(next));
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Paper className="glass-card" sx={{ p: 1.5 }}>
        <Tabs value={tab} onChange={handleChange} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile>
          {TABS.map((label) => <Tab key={label} label={label} />)}
        </Tabs>
      </Paper>

      {tab === 0 && <ProjectList />}
      {tab === 1 && <AssetRegistryPage />}
      {tab === 2 && <DispatchBoardPage />}
    </Box>
  );
}
