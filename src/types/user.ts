export type Office = "USA" | "Australia" | "South Africa";

export type UserRole = "Admin" | "Project Manager" | "Engineer" | "Viewer";

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  office: Office;
  isActive: boolean;
  isFirstLogin: boolean;
}
