/** Workflow-scoped equivalent of ProductWorkflowContext (see productWorkflowContext.ts) — mirrors
 *  WorkflowAuthoringContextDto on the server. Unlike the Product-level context, this contains
 *  ONLY the Features actually selected (quantity > 0) in one specific WorkflowConfig, each with
 *  its real quantity: "this is the actual equipment configuration for this workflow," not the
 *  Product's full catalog. Never contains customer/project/run data, answers, or secrets. */
export interface WorkflowAuthoringContext {
  schemaVersion: number;
  product: { id: string; name: string };
  workflowConfigId: string;
  workflowConfigName: string;
  features: WorkflowAuthoringFeature[];
}

export interface WorkflowAuthoringFeature {
  featureId: string;
  name: string;
  quantity: number;
  captureFields: string[];
  brand?: string | null;
  supplier?: string | null;
  alternativePartNumber?: string | null;
  manufacturerPartNumber?: string | null;
  unitPrice?: number | null;
  dependencyIds: string[];
}
