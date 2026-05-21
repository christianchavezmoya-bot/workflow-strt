import { Navigate, Outlet, Route, Routes, useParams } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import { usePermissions } from "../hooks/usePermissions";
import Dashboard from "../features/dashboard/Dashboard";
import ProjectsPage from "../features/projects/ProjectsPage";
import ProjectForm from "../features/projects/ProjectForm";
import ProjectDetail from "../features/projects/ProjectDetail";
import ProjectAssetInspectionPage from "../features/projects/ProjectAssetInspectionPage";
import AssetInstallationPage from "../features/installations/AssetInstallationPage";
import WorkInstructions from "../features/workInstructions/WorkInstructions";
import UserManagement from "../features/admin/UserManagement";
import CustomerSites from "../features/admin/CustomerSites";
import DocumentsPage from "../features/documents/DocumentsPage";
import TipsAndTricksPage from "../features/tips/TipsAndTricksPage";
import ProfileWizard from "../features/profile/ProfileWizard";
import Settings from "../features/settings/Settings";
import Login from "../features/auth/Login";
import ResetPassword from "../features/auth/ResetPassword";
import ExternalSignPage from "../features/sign/ExternalSignPage";
import IssuesBoard from "../features/issues/IssuesBoard";
import MobileUploadPage from "../features/mobile-upload/MobileUploadPage";
// ── BOM Module (feature-flagged, conditionally imported) ──────────────────────
import {
  BOM_MODULE_ENABLED,
  BomProjectProvider,
  BomDashboard,
  BomUploadPage,
  BomMappingPage,
  BomClassificationPage,
  BomCommitPage,
} from "../modules/bom-project";

const SettingsRoute = () => {
  const can = usePermissions();
  return can.viewOnly ? <Navigate to="/" replace /> : <Settings />;
};

const ProjectInspectionsRedirect = () => {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/projects/${id}`} replace />;
};

const AppRoutes = () => {
  return (
    <Routes>
      {/* ── Public routes (no auth) ── */}
      <Route path="/login" element={<Login />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/sign/:tokenId" element={<ExternalSignPage />} />

      {/* ── Authenticated app shell ── */}
      <Route element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/new" element={<ProjectForm />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/projects/:id/inspections" element={<ProjectInspectionsRedirect />} />
        <Route path="/projects/:id/inspections/inbox" element={<ProjectDetail />} />
        <Route path="/projects/:id/assets/:assetId/inspections" element={<ProjectAssetInspectionPage />} />
        <Route path="/installations/assets" element={<AssetInstallationPage />} />
        <Route path="/work-instructions" element={<WorkInstructions />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/tips" element={<TipsAndTricksPage />} />
        <Route path="/admin" element={<UserManagement />} />
        <Route path="/admin/customers/:customerId/sites" element={<CustomerSites />} />
        <Route path="/admin/asset-registry" element={<Navigate to="/projects" replace />} />
        <Route path="/issues" element={<IssuesBoard />} />
        <Route path="/settings" element={<SettingsRoute />} />
        <Route path="/profile" element={<ProfileWizard />} />
        {/* ── BOM Module routes (only when feature flag enabled) ── */}
        {BOM_MODULE_ENABLED && (
          <Route element={<BomProjectProvider><Outlet /></BomProjectProvider>}>
            <Route path="/admin/bom-project" element={<BomDashboard />} />
            <Route path="/admin/bom-project/upload" element={<BomUploadPage />} />
            <Route path="/admin/bom-project/imports/:id/mapping" element={<BomMappingPage />} />
            <Route path="/admin/bom-project/imports/:id/classification" element={<BomClassificationPage />} />
            <Route path="/admin/bom-project/imports/:id/compare" element={<Navigate to="/admin/bom-project" replace />} />
            <Route path="/admin/bom-project/imports/:id/preview" element={<Navigate to="/admin/bom-project" replace />} />
            <Route path="/admin/bom-project/imports/:id/commit" element={<BomCommitPage />} />
          </Route>
        )}
      </Route>
      {/* ── Mobile upload (public — phone camera scan) ── */}
      <Route path="/mobile-upload" element={<MobileUploadPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default AppRoutes;
