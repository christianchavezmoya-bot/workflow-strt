import { Suspense, type ReactNode } from "react";
import { Box, CircularProgress } from "@mui/material";
import { Navigate, Outlet, Route, Routes, useParams } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import { usePermissions } from "../hooks/usePermissions";
import { BOM_MODULE_ENABLED } from "../modules/bom-project";
import { isMobileNativePlatform } from "../utils/platform";
import { lazyWithChunkReload } from "../utils/lazyWithChunkReload";

const Dashboard = lazyWithChunkReload(() => import("../features/dashboard/Dashboard"));
const ProjectsPage = lazyWithChunkReload(() => import("../features/projects/ProjectsPage"));
const ProjectForm = lazyWithChunkReload(() => import("../features/projects/ProjectForm"));
const ProjectDetail = lazyWithChunkReload(() => import("../features/projects/ProjectDetail"));
const ProjectAssetInspectionPage = lazyWithChunkReload(() => import("../features/projects/ProjectAssetInspectionPage"));
const AssetInstallationPage = lazyWithChunkReload(() => import("../features/installations/AssetInstallationPage"));
const CaptureTablePage = lazyWithChunkReload(() => import("../features/installations/CaptureTablePage"));
const WorkInstructions = lazyWithChunkReload(() => import("../features/workInstructions/WorkInstructions"));
const UserManagement = lazyWithChunkReload(() => import("../features/admin/UserManagement"));
const CustomerSites = lazyWithChunkReload(() => import("../features/admin/CustomerSites"));
const DocumentsPage = lazyWithChunkReload(() => import("../features/documents/DocumentsPage"));
const TipsAndTricksPage = lazyWithChunkReload(() => import("../features/tips/TipsAndTricksPage"));
const ProfileWizard = lazyWithChunkReload(() => import("../features/profile/ProfileWizard"));
const Settings = lazyWithChunkReload(() => import("../features/settings/Settings"));
const Login = lazyWithChunkReload(() => import("../features/auth/Login"));
const ResetPassword = lazyWithChunkReload(() => import("../features/auth/ResetPassword"));
const ExternalSignPage = lazyWithChunkReload(() => import("../features/sign/ExternalSignPage"));
const AssetReportShareViewPage = lazyWithChunkReload(() => import("../features/reports/AssetReportShareViewPage"));
const IssuesBoard = lazyWithChunkReload(() => import("../features/issues/IssuesBoard"));
const MobileUploadPage = lazyWithChunkReload(() => import("../features/mobile-upload/MobileUploadPage"));
const TimeAnalyticsPage = lazyWithChunkReload(() => import("../features/timeAnalytics"));
const FaultReportsPage = lazyWithChunkReload(() => import("../features/support/FaultReportsPage"));

const BomProjectProvider = lazyWithChunkReload(() =>
  import("../modules/bom-project").then((module) => ({ default: module.BomProjectProvider }))
);
const BomDashboard = lazyWithChunkReload(() =>
  import("../modules/bom-project").then((module) => ({ default: module.BomDashboard }))
);
const BomUploadPage = lazyWithChunkReload(() =>
  import("../modules/bom-project").then((module) => ({ default: module.BomUploadPage }))
);
const BomMappingPage = lazyWithChunkReload(() =>
  import("../modules/bom-project").then((module) => ({ default: module.BomMappingPage }))
);
const BomClassificationPage = lazyWithChunkReload(() =>
  import("../modules/bom-project").then((module) => ({ default: module.BomClassificationPage }))
);
const BomCommitPage = lazyWithChunkReload(() =>
  import("../modules/bom-project").then((module) => ({ default: module.BomCommitPage }))
);

function RouteFallback() {
  return (
    <Box sx={{ minHeight: 240, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <CircularProgress size={28} />
    </Box>
  );
}

function LazyRoute({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

const SettingsRoute = () => {
  const can = usePermissions();
  // Wait until both the real user identity and role config have loaded before
  // deciding to redirect — the initial Viewer placeholder causes a false-negative
  // on first render that permanently redirects away from /settings.
  if (!can.permissionsReady) return null;
  return can.settings.view ? <Settings /> : <Navigate to="/" replace />;
};

// Every guard below waits for permissionsReady for the same reason SettingsRoute does:
// usePermissions returns a Viewer placeholder until the role config settles, so deciding
// before then bounces authorised users off their own pages on a cold load.
const TimeAnalyticsRoute = () => {
  const can = usePermissions();
  if (isMobileNativePlatform()) {
    return <Navigate to="/" replace />;
  }
  if (!can.permissionsReady) return null;
  return can.analytics.view ? <TimeAnalyticsPage /> : <Navigate to="/" replace />;
};

// /admin had no guard at all — any authenticated user could open User Management by URL
// and read the full user list. Buttons inside were gated, so they could not change
// anything, but the page and its data rendered.
const AdminRoute = () => {
  const can = usePermissions();
  if (!can.permissionsReady) return null;
  return can.admin.view ? <UserManagement /> : <Navigate to="/" replace />;
};

const CustomerSitesRoute = () => {
  const can = usePermissions();
  if (!can.permissionsReady) return null;
  return can.admin.view ? <CustomerSites /> : <Navigate to="/" replace />;
};

const FaultReportsRoute = () => {
  const can = usePermissions();
  if (!can.permissionsReady) return null;
  return can.settings.view ? <FaultReportsPage /> : <Navigate to="/" replace />;
};

const TipsRoute = () => {
  const can = usePermissions();
  if (!can.permissionsReady) return null;
  return can.tips.view ? <TipsAndTricksPage /> : <Navigate to="/" replace />;
};

const WorkInstructionsRoute = () => {
  const can = usePermissions();
  if (!can.permissionsReady) return null;
  return can.workInstructionsBuilder.view ? <WorkInstructions /> : <Navigate to="/" replace />;
};

// Guards the whole BOM module. The routes are already behind BOM_MODULE_ENABLED; this adds
// the per-role check the module never had.
const BomRoute = ({ children }: { children: ReactNode }) => {
  const can = usePermissions();
  if (!can.permissionsReady) return null;
  return can.bomProject.view ? <>{children}</> : <Navigate to="/" replace />;
};

const ProjectInspectionsRedirect = () => {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/projects/${id}`} replace />;
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<LazyRoute><Login /></LazyRoute>} />
      <Route path="/reset-password" element={<LazyRoute><ResetPassword /></LazyRoute>} />
      <Route path="/sign/:tokenId" element={<LazyRoute><ExternalSignPage /></LazyRoute>} />
      <Route path="/share/reports/:shareId" element={<LazyRoute><AssetReportShareViewPage /></LazyRoute>} />

      <Route element={<AppShell />}>
        <Route index element={<LazyRoute><Dashboard /></LazyRoute>} />
        <Route path="/projects" element={<LazyRoute><ProjectsPage /></LazyRoute>} />
        <Route path="/projects/new" element={<LazyRoute><ProjectForm /></LazyRoute>} />
        <Route path="/projects/:id" element={<LazyRoute><ProjectDetail /></LazyRoute>} />
        <Route path="/projects/:id/edit" element={<LazyRoute><ProjectForm /></LazyRoute>} />
        <Route path="/projects/:id/inspections/inbox" element={<LazyRoute><ProjectDetail /></LazyRoute>} />
        <Route path="/projects/:id/inspections" element={<ProjectInspectionsRedirect />} />
        <Route path="/projects/:id/assets/:assetId/inspections" element={<LazyRoute><ProjectAssetInspectionPage /></LazyRoute>} />
        <Route path="/installations/assets" element={<LazyRoute><AssetInstallationPage /></LazyRoute>} />
        <Route path="/installations/capture" element={<LazyRoute><CaptureTablePage /></LazyRoute>} />
        <Route path="/work-instructions" element={<LazyRoute><WorkInstructionsRoute /></LazyRoute>} />
        <Route path="/documents" element={<LazyRoute><DocumentsPage /></LazyRoute>} />
        <Route path="/tips" element={<LazyRoute><TipsRoute /></LazyRoute>} />
        <Route path="/admin" element={<LazyRoute><AdminRoute /></LazyRoute>} />
        <Route path="/admin/customers/:customerId/sites" element={<LazyRoute><CustomerSitesRoute /></LazyRoute>} />
        <Route path="/admin/fault-reports" element={<LazyRoute><FaultReportsRoute /></LazyRoute>} />
        <Route path="/issues" element={<LazyRoute><IssuesBoard /></LazyRoute>} />
        <Route path="/time-analytics" element={<LazyRoute><TimeAnalyticsRoute /></LazyRoute>} />
        <Route path="/time-analytics/:view" element={<LazyRoute><TimeAnalyticsRoute /></LazyRoute>} />
        <Route path="/settings" element={<LazyRoute><SettingsRoute /></LazyRoute>} />
        <Route path="/profile" element={<LazyRoute><ProfileWizard /></LazyRoute>} />
        {BOM_MODULE_ENABLED && (
          <Route
            element={
              <LazyRoute>
                <BomRoute>
                  <BomProjectProvider>
                    <Outlet />
                  </BomProjectProvider>
                </BomRoute>
              </LazyRoute>
            }
          >
            <Route path="/admin/bom-project" element={<LazyRoute><BomDashboard /></LazyRoute>} />
            <Route path="/admin/bom-project/upload" element={<LazyRoute><BomUploadPage /></LazyRoute>} />
            <Route path="/admin/bom-project/imports/:id/mapping" element={<LazyRoute><BomMappingPage /></LazyRoute>} />
            <Route path="/admin/bom-project/imports/:id/classification" element={<LazyRoute><BomClassificationPage /></LazyRoute>} />
            <Route path="/admin/bom-project/imports/:id/commit" element={<LazyRoute><BomCommitPage /></LazyRoute>} />
          </Route>
        )}
      </Route>

      <Route path="/mobile-upload" element={<LazyRoute><MobileUploadPage /></LazyRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default AppRoutes;
