import type { ReactNode } from "react";
import type { PmDashboardTab } from "./dashboardPageLogic";

type Props = {
  pmDashboardTab: PmDashboardTab;
  projectStatusGrid: ReactNode;
  needsAttentionSection: ReactNode;
  inspectionTabContent: ReactNode;
  pmProjectsTabContent: ReactNode;
  installTabContent: ReactNode;
};

export default function DashboardManagerDesktopView({
  pmDashboardTab,
  projectStatusGrid,
  needsAttentionSection,
  inspectionTabContent,
  pmProjectsTabContent,
  installTabContent,
}: Props) {
  return (
    <>
      {pmDashboardTab === "pm-projects" && projectStatusGrid}
      {pmDashboardTab === "pm-projects" && needsAttentionSection}
      {pmDashboardTab === "my-inspections" && inspectionTabContent}
      {pmDashboardTab === "pm-projects" && pmProjectsTabContent}
      {pmDashboardTab === "my-installs" && installTabContent}
    </>
  );
}
