import { ProjectStatus, ProjectType } from "../types/project";

const internalSteps: ProjectStatus[] = ["Draft", "Approved", "In Progress", "Completed", "Closed"];

const externalSteps: ProjectStatus[] = [
  "Draft",
  "Pending Approval",
  "Approved",
  "In Progress",
  "Completed",
  "Closed"
];

export const getStepsForType = (type: ProjectType) => {
  return type === "External" ? externalSteps : internalSteps;
};
