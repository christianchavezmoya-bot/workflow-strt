import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import { usePermissions } from "../hooks/usePermissions";
import Dashboard from "../features/dashboard/Dashboard";
import ProjectsPage from "../features/projects/ProjectsPage";
import ProjectForm from "../features/projects/ProjectForm";
import ProjectDetail from "../features/projects/ProjectDetail";
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
// ── BOM Module (feature-flagged, conditionally imported) ──────────────────────
import {
  BOM_MODULE_ENABLED,
  BomProjectProvider,
  BomDashboard,
  BomUploadPage,
  BomMappingPage,
  BomClassificationPage,
  BomComparisonPage,
  BomPreviewPage,
  BomCommitPage,
} from "../modules/bom-project";

const SettingsRoute = () => {
  const can = usePermissions();
  return can.viewOnly ? <Navigate to="/" replace /> : <Settings />;
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
        <Route path="/projects/:id/edit" element={<ProjectForm />} />
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
          <>
            <Route path="/admin/bom-project" element={<BomProjectProvider><BomDashboard /></BomProjectProvider>} />
            <Route path="/admin/bom-project/upload" element={<BomProjectProvider><BomUploadPage /></BomProjectProvider>} />
            <Route path="/admin/bom-project/imports/:id/mapping" element={<BomProjectProvider><BomMappingPage /></BomProjectProvider>} />
            <Route path="/admin/bom-project/imports/:id/classification" element={<BomProjectProvider><BomClassificationPage /></BomProjectProvider>} />
            <Route path="/admin/bom-project/imports/:id/compare" element={<BomProjectProvider><BomComparisonPage /></BomProjectProvider>} />
            <Route path="/admin/bom-project/imports/:id/preview" element={<BomProjectProvider><BomPreviewPage /></BomProjectProvider>} />
            <Route path="/admin/bom-project/imports/:id/commit" element={<BomProjectProvider><BomCommitPage /></BomProjectProvider>} />
          </>
        )}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default AppRoutes;
