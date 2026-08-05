import { Suspense, lazy, type ReactNode } from "react";
import { Box, CircularProgress } from "@mui/material";
import { Navigate, Outlet, Route, Routes, useParams } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import { usePermissions } from "../hooks/usePermissions";
import { BOM_MODULE_ENABLED } from "../modules/bom-project";

const Dashboard = lazy(() => import("../features/dashboard/Dashboard"));
const ProjectsPage = lazy(() => import("../features/projects/ProjectsPage"));
const ProjectForm = lazy(() => import("../features/projects/ProjectForm"));
const ProjectDetail = lazy(() => import("../features/projects/ProjectDetail"));
const ProjectAssetInspectionPage = lazy(() => import("../features/projects/ProjectAssetInspectionPage"));
const AssetInstallationPage = lazy(() => import("../features/installations/AssetInstallationPage"));
const CaptureTablePage = lazy(() => import("../features/installations/CaptureTablePage"));
const WorkInstructions = lazy(() => import("../features/workInstructions/WorkInstructions"));
const UserManagement = lazy(() => import("../features/admin/UserManagement"));
const CustomerSites = lazy(() => import("../features/admin/CustomerSites"));
const DocumentsPage = lazy(() => import("../features/documents/DocumentsPage"));
const TipsAndTricksPage = lazy(() => import("../features/tips/TipsAndTricksPage"));
const ProfileWizard = lazy(() => import("../features/profile/ProfileWizard"));
const Settings = lazy(() => import("../features/settings/Settings"));
const Login = lazy(() => import("../features/auth/Login"));
const ResetPassword = lazy(() => import("../features/auth/ResetPassword"));
const ExternalSignPage = lazy(() => import("../features/sign/ExternalSignPage"));
const AssetReportShareViewPage = lazy(() => import("../features/reports/AssetReportShareViewPage"));
const IssuesBoard = lazy(() => import("../features/issues/IssuesBoard"));
const MobileUploadPage = lazy(() => import("../features/mobile-upload/MobileUploadPage"));

const BomProjectProvider = lazy(() =>
  import("../modules/bom-project").then((module) => ({ default: module.BomProjectProvider }))
);
const BomDashboard = lazy(() =>
  import("../modules/bom-project").then((module) => ({ default: module.BomDashboard }))
);
const BomUploadPage = lazy(() =>
  import("../modules/bom-project").then((module) => ({ default: module.BomUploadPage }))
);
const BomMappingPage = lazy(() =>
  import("../modules/bom-project").then((module) => ({ default: module.BomMappingPage }))
);
const BomClassificationPage = lazy(() =>
  import("../modules/bom-project").then((module) => ({ default: module.BomClassificationPage }))
);
const BomCommitPage = lazy(() =>
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
        <Route path="/projects/:id/inspections" element={<ProjectInspectionsRedirect />} />
        <Route path="/projects/:id/assets/:assetId/inspections" element={<LazyRoute><ProjectAssetInspectionPage /></LazyRoute>} />
        <Route path="/installations/assets" element={<LazyRoute><AssetInstallationPage /></LazyRoute>} />
        <Route path="/installations/capture" element={<LazyRoute><CaptureTablePage /></LazyRoute>} />
        <Route path="/work-instructions" element={<LazyRoute><WorkInstructions /></LazyRoute>} />
        <Route path="/documents" element={<LazyRoute><DocumentsPage /></LazyRoute>} />
        <Route path="/tips" element={<LazyRoute><TipsAndTricksPage /></LazyRoute>} />
        <Route path="/admin" element={<LazyRoute><UserManagement /></LazyRoute>} />
        <Route path="/admin/customers/:customerId/sites" element={<LazyRoute><CustomerSites /></LazyRoute>} />
        <Route path="/admin/asset-registry" element={<Navigate to="/projects" replace />} />
        <Route path="/issues" element={<LazyRoute><IssuesBoard /></LazyRoute>} />
        <Route path="/settings" element={<LazyRoute><SettingsRoute /></LazyRoute>} />
        <Route path="/profile" element={<LazyRoute><ProfileWizard /></LazyRoute>} />
        {BOM_MODULE_ENABLED && (
          <Route
            element={
              <LazyRoute>
                <BomProjectProvider>
                  <Outlet />
                </BomProjectProvider>
              </LazyRoute>
            }
          >
            <Route path="/admin/bom-project" element={<LazyRoute><BomDashboard /></LazyRoute>} />
            <Route path="/admin/bom-project/upload" element={<LazyRoute><BomUploadPage /></LazyRoute>} />
            <Route path="/admin/bom-project/imports/:id/mapping" element={<LazyRoute><BomMappingPage /></LazyRoute>} />
            <Route path="/admin/bom-project/imports/:id/classification" element={<LazyRoute><BomClassificationPage /></LazyRoute>} />
            <Route path="/admin/bom-project/imports/:id/compare" element={<Navigate to="/admin/bom-project" replace />} />
            <Route path="/admin/bom-project/imports/:id/preview" element={<Navigate to="/admin/bom-project" replace />} />
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
