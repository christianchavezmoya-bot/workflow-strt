export type WorkInstructionStatus = "Draft" | "Active" | "Archived";

export interface WorkInstruction {
  id: string;
  productId: string;
  title: string;
  summary?: string;
  steps: string[];
  status: WorkInstructionStatus;
  featureValues: Record<string, string>;
  updatedAt: string;
  dirty?: boolean;
  syncError?: string;
}

export interface WorkInstructionInput {
  title: string;
  summary?: string;
  steps: string[];
  status: WorkInstructionStatus;
  featureValues: Record<string, string>;
}
