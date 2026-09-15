/** WF-6A: Product master data only — mirrors ProductWorkflowContextDto on the server. Never
 *  contains WorkflowConfig-specific selection state, secrets, or customer/project/run data. */
export interface ProductWorkflowContext {
  schemaVersion: number;
  product: { id: string; name: string };
  features: FeatureWorkflowContext[];
}

export interface FeatureDependencyWorkflowContext {
  dependencyId: string;
  name: string;
  featureId: string;
  isInventory: boolean;
  captureFields: string[];
  defaultQty: number;
  unit?: string | null;
  unitPrice: number;
  sortOrder: number;
}

export interface FeatureWorkflowContext {
  featureId: string;
  name: string;
  description?: string | null;
  valueType: string;
  options: string[];
  subProperties: { id: string; name: string; valueType: string; isInventory?: boolean; unit?: string }[];
  isInventory: boolean;
  /** Mirrors isFeatureAvailableForNewSelection's master-data rule. */
  selectable: boolean;
  sortOrder: number;
  brand?: string | null;
  supplier?: string | null;
  alternativePartNumber?: string | null;
  manufacturerPartNumber?: string | null;
  unitPrice?: number | null;
  productLink?: string | null;
  dependencies: FeatureDependencyWorkflowContext[];
}
