import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import Dashboard from "../features/dashboard/Dashboard";
import ProjectList from "../features/projects/ProjectList";
import ProjectForm from "../features/projects/ProjectForm";
import ProjectDetail from "../features/projects/ProjectDetail";
import AssetInstallationPage from "../features/installations/AssetInstallationPage";
import WorkInstructions from "../features/workInstructions/WorkInstructions";
import UserManagement from "../features/admin/UserManagement";
import CustomerSites from "../features/admin/CustomerSites";
import AssetRegistryPage from "../features/admin/AssetRegistryPage";
import DocumentsPage from "../features/documents/DocumentsPage";
import ProfileWizard from "../features/profile/ProfileWizard";
import Settings from "../features/settings/Settings";
import Login from "../features/auth/Login";
import ResetPassword from "../features/auth/ResetPassword";

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="/projects" element={<ProjectList />} />
        <Route path="/projects/new" element={<ProjectForm />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/projects/:id/edit" element={<ProjectForm />} />
        <Route path="/installations/assets" element={<AssetInstallationPage />} />
        <Route path="/work-instructions" element={<WorkInstructions />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/admin" element={<UserManagement />} />
        <Route path="/admin/customers/:customerId/sites" element={<CustomerSites />} />
        <Route path="/admin/asset-registry" element={<AssetRegistryPage />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/profile" element={<ProfileWizard />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default AppRoutes;
