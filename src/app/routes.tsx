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
import ProfileWizard from "../features/profile/ProfileWizard";
import Settings from "../features/settings/Settings";
import Login from "../features/auth/Login";
import ResetPassword from "../features/auth/ResetPassword";
import ExternalSignPage from "../features/sign/ExternalSignPage";

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
        <Route path="/admin" element={<UserManagement />} />
        <Route path="/admin/customers/:customerId/sites" element={<CustomerSites />} />
        <Route path="/admin/asset-registry" element={<Navigate to="/projects" replace />} />
        <Route path="/settings" element={<SettingsRoute />} />
        <Route path="/profile" element={<ProfileWizard />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default AppRoutes;
