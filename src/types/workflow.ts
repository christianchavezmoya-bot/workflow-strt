// Workflow Builder — data model
// Phase 1: localStorage-persisted per-product workflow templates.

export type StepInputType =
  | "text"
  | "number"
  | "choice"
  | "checkbox"
  | "photo"
  | "video"
  | "signature"
  | "note"
  | "scan"
  | "date"
  | "component";

export interface Decision {
  id: string;
  label: string;
  targetStepId: string | null;
}

export interface StepInput {
  id: string;
  type: StepInputType;
  label: string;
  required: boolean;
  options?: string[]; // for "choice" type
  featureId?: string; // set when sourced from a product feature definition
  subFields?: { id: string; name: string }[]; // for "component" type
}

export interface WorkflowStep {
  id: string;
  order: number;
  title: string;
  description: string;
  /** When true, overrideReportText is used in the report instead of description */
  overrideInReport: boolean;
  overrideReportText: string;
  includeDescriptionInReport: boolean;
  mediaIds: string[];
  decisionsEnabled: boolean;
  decisions: Decision[];
  inputs: StepInput[];
  nextStepId: string | null;
}

export interface MediaItem {
  id: string;
  type: "image" | "video";
  name: string;
  size: number;
  mime: string;
  url: string;
  createdAt: number;
}

export interface Workflow {
  id: string;
  name: string;
  productId: string;
  createdAt: number;
  steps: WorkflowStep[];
  media: MediaItem[];
}
