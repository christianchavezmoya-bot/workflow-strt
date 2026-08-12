import type { ComponentProps } from "react";
import type { Project } from "../../types/project";
import ProjectChevronPanel from "./ProjectChevronPanel";

type ProjectChevronPanelProps = ComponentProps<typeof ProjectChevronPanel>;

export function buildProjectChevronProps(project: Project): ProjectChevronPanelProps {
  return {
    projectId: project.id,
    productId: project.productIds?.[0],
    projectJobNumber: project.jobNumber,
    projectCustomer: project.customerName,
    projectSite: project.siteName,
    projectManager: project.projectManager,
    projectStatus: project.status,
    projectStartDate: project.startDate,
    projectFinishDate: project.finishDate,
    projectDescription: project.description,
    projectCustomerId: project.customerId,
    projectTimeZoneId: project.timeZoneId,
  };
}
