import { Box, Grid, Typography } from "@mui/material";
import type { Office } from "../../components/GlobalOfficeMap";
import type { OpenAssetItem } from "../../services/projectAssetService";
import type { Project } from "../../types/project";

type Props = {
  activeOffice: string;
  availableCountries: string[];
  projects: Project[];
  globalOffices: Office[];
  openAssets: OpenAssetItem[];
  countryForOffice: (office: string) => string;
  onSelectRegion: (region: string) => void;
};

export default function DashboardRegionalSnapshotSection({
  activeOffice,
  availableCountries,
  projects,
  globalOffices,
  openAssets,
  countryForOffice,
  onSelectRegion,
}: Props) {
  return (
    <Box className="glass-card" sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom sx={{ fontFamily: "Sora" }}>
        Regional snapshot ({activeOffice})
      </Typography>
      <Grid container spacing={2}>
        {(activeOffice === "All" ? availableCountries : [activeOffice]).map((region) => {
          const rp = projects.filter((p) => {
            const c = countryForOffice(p.office);
            return c === region || p.office === region;
          });
          const rIds = new Set(globalOffices.filter((o) => o.country === region).map((o) => o.id));
          const rAssets = openAssets.filter((a) => {
            if (a.officeId) return rIds.has(a.officeId);
            const c = countryForOffice(a.office);
            return c === region || a.office === region;
          }).length;
          return (
            <Grid key={region} item xs={12} md={4}>
              <Box
                onClick={() => onSelectRegion(region)}
                sx={{
                  p: 2,
                  borderRadius: 2,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.04)",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  "&:hover": { background: "rgba(45,212,191,0.1)", borderColor: "rgba(45,212,191,0.3)" },
                }}
              >
                <Typography variant="subtitle1" sx={{ fontFamily: "Sora" }}>
                  {region}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {rp.length} projects - {rp.filter((p) => p.status === "In Progress").length} in progress
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {rAssets} active installations
                </Typography>
              </Box>
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );
}
