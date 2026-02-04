import { Project } from "../types/project";
import { Installation } from "../types/installation";
import { User } from "../types/user";
import { Customer } from "../types/customer";
import { Product } from "../types/product";

export const demoProjects: Project[] = [
  {
    id: "P-1024",
    customerName: "Acme Energy",
    customerId: "C-1908",
    jobNumber: "JOB-2026-001",
    description: "Multi-site turbine retrofit",
    startDate: "2026-01-12",
    finishDate: "2026-04-20",
    office: "USA",
    projectType: "External",
    status: "Pending Approval",
    isInstallationProject: true,
    installationMode: "Multiple Installations",
    projectManager: "Jordan Ames",
    productIds: ["prod-1", "prod-2"]
  },
  {
    id: "P-1041",
    customerName: "BlueWave Telecom",
    customerId: "C-2301",
    jobNumber: "JOB-2026-018",
    description: "Core switch upgrade",
    startDate: "2026-02-02",
    finishDate: "2026-03-30",
    office: "Australia",
    projectType: "Internal",
    status: "Draft",
    isInstallationProject: false,
    projectManager: "Priya Nair",
    productIds: ["prod-3"]
  }
];

export const demoInstallations: Installation[] = [
  {
    id: "I-1001",
    projectId: "P-1024",
    installationNumber: "INST-1001-01",
    installationName: "Site A - Sydney HQ",
    siteLocation: "Sydney HQ",
    scheduledStart: "2026-02-10",
    scheduledEnd: "2026-02-12",
    status: "Not Started",
    assignedTeam: "AU Delivery Team",
    office: "Australia"
  },
  {
    id: "I-1002",
    projectId: "P-1024",
    installationNumber: "INST-1001-02",
    installationName: "Melbourne Branch",
    siteLocation: "Melbourne Branch",
    scheduledStart: "2026-03-01",
    scheduledEnd: "2026-03-03",
    status: "In Progress",
    assignedTeam: "AU Delivery Team",
    office: "Australia"
  }
];

export const demoUsers: User[] = [
  {
    id: "u-101",
    email: "avery.cole@commtrac.io",
    fullName: "Avery Cole",
    role: "Admin",
    office: "USA",
    isActive: true,
    isFirstLogin: false
  },
  {
    id: "u-102",
    email: "mila.zulu@commtrac.io",
    fullName: "Mila Zulu",
    role: "Project Manager",
    office: "South Africa",
    isActive: true,
    isFirstLogin: true
  }
];

export const demoCustomers: Customer[] = [
  {
    id: "c-200",
    name: "Acme Energy",
    customerId: "C-1908",
    office: "USA"
  },
  {
    id: "c-201",
    name: "BlueWave Telecom",
    customerId: "C-2301",
    office: "Australia"
  }
];

export const demoProducts: Product[] = [
  {
    id: "prod-1",
    name: "StrataConnect"
  },
  {
    id: "prod-2",
    name: "StrataProtect"
  },
  {
    id: "prod-3",
    name: "Other"
  }
];
