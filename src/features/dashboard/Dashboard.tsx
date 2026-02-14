import { Box, Grid, Stack, Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import SummaryCard from "../../components/ui/SummaryCard";
import StatusStepper from "../../components/ui/StatusStepper";
import { demoProducts } from "../../data/demo";
import { useActiveOffice } from "../../hooks/useActiveOffice";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { fetchInstallations } from "../../store/installationSlice";
import { fetchProducts } from "../../store/productsSlice";
import { fetchProjects } from "../../store/projectSlice";
import { officesService } from "../../services/officesService";
import type { Office } from "../../components/GlobalOfficeMap";
import { createCountryResolver } from "../../utils/officeCountry";

const Dashboard = () => {
  const navigate = useNavigate();
  const { activeOffice, updateActiveOffice } = useActiveOffice();
  const dispatch = useAppDispatch();
  const projectsState = useAppSelector((state) => state.projects);
  const installationsState = useAppSelector((state) => state.installations);
  const productsState = useAppSelector((state) => state.products);
  const products = productsState.items.length ? productsState.items : demoProducts;
  const projects = projectsState.items;
  const installations = installationsState.items;
  const [globalOffices, setGlobalOffices] = useState<Office[]>([]);
  const [availableCountries, setAvailableCountries] = useState<string[]>([]);

  useEffect(() => {
    officesService.getAll().then((offices) => {
      setGlobalOffices(offices);
      const countries = Array.from(new Set(offices.map((office) => office.country).filter(Boolean)));
      setAvailableCountries(countries.sort());
    });
  }, []);

  const countryForOffice = useMemo(() => createCountryResolver(globalOffices), [globalOffices]);

  const filteredProjects = useMemo(() => {
    if (activeOffice === "All") return projects;
    return projects.filter((project) => {
      const projectCountry = countryForOffice(project.office);
      return projectCountry === activeOffice || project.office === activeOffice;
    });
  }, [activeOffice, projects, countryForOffice]);

  const filteredInstallations = useMemo(() => {
    if (activeOffice === "All") return installations;
    return installations.filter((installation) => {
      const installationCountry = countryForOffice(installation.office);
      return installationCountry === activeOffice || installation.office === activeOffice;
    });
  }, [activeOffice, installations, countryForOffice]);

  const productCount = products.length;
  const projectCount = filteredProjects.length;
  const activeInstallationsCount = filteredInstallations.filter((installation) =>
    ["Scheduled", "In Progress"].includes(installation.status)
  ).length;
  const pendingApprovalCount = filteredProjects.filter((project) => project.status === "Pending Approval").length;

  useEffect(() => {
    dispatch(fetchProducts());
    dispatch(fetchProjects());
    dispatch(fetchInstallations());
  }, [dispatch]);

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
        <SummaryCard title="Total Projects" value={String(projectCount)} trend="Across active global office" />
        <SummaryCard title="Active Installations" value={String(activeInstallationsCount)} trend="Scheduled + In Progress" />
        <SummaryCard title="Pending Approvals" value={String(pendingApprovalCount)} trend="Awaiting review" />
        <SummaryCard title="Products" value={String(productCount)} trend="Catalog size" />
      </Stack>

      <StatusStepper type="External" status="Pending Approval" />

      <Box className="glass-card" sx={{ padding: 3 }}>
        <Typography variant="h6" gutterBottom>
          Regional snapshot ({activeOffice})
        </Typography>
        <Grid container spacing={2}>
          {(activeOffice === "All"
            ? availableCountries
            : [activeOffice]
          ).map((region) => {
            const regionProjects = projects.filter((project) => {
              const projectCountry = countryForOffice(project.office);
              return projectCountry === region || project.office === region;
            });
            const regionInstallations = installations.filter((installation) => {
              const installationCountry = countryForOffice(installation.office);
              return installationCountry === region || installation.office === region;
            });
            const regionActiveInstalls = regionInstallations.filter((installation) =>
              ["Scheduled", "In Progress"].includes(installation.status)
            ).length;
            return (
              <Grid key={region} item xs={12} md={4}>
                <Box
                  onClick={() => {
                    updateActiveOffice(region);
                    navigate("/projects");
                  }}
                  sx={{
                    padding: 2,
                    borderRadius: 2,
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(255,255,255,0.04)",
                    cursor: "pointer",
                    transition: "all 0.2s",
                    "&:hover": {
                      background: "rgba(45, 212, 191, 0.1)",
                      borderColor: "rgba(45, 212, 191, 0.3)",
                      transform: "translateY(-2px)"
                    }
                  }}
                >
                  <Typography variant="subtitle1" sx={{ fontFamily: "Sora" }}>
                    {region}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {regionProjects.length} projects - {regionActiveInstalls} installations active
                  </Typography>
                </Box>
              </Grid>
            );
          })}
        </Grid>
      </Box>
    </Stack>
  );
};

export default Dashboard;
