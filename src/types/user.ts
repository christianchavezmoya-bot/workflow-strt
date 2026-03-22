export type Office = string;

export type BaseUserRole = "Admin" | "Project Manager" | "Engineer" | "Viewer" | "Installer" | "Supervisor" | "Customer";
export type UserRole = BaseUserRole | (string & {});

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  office: Office;
  isActive: boolean;
  isFirstLogin: boolean;
  is2faEnabled?: boolean;
  recoveryCodesRemaining?: number;
  passwordExpired?: boolean;
}
