import { ProjectStatus, ProjectType } from "../types/project";

const internalSteps: ProjectStatus[] = ["Draft", "Approved", "In Progress", "Completed"];

const externalSteps: ProjectStatus[] = [
  "Draft",
  "Pending Approval",
  "Approved",
  "In Progress",
  "Completed"
];

export const getStepsForType = (type: ProjectType) => {
  return type === "External" ? externalSteps : internalSteps;
};
