export type ProductFeatureValueType =
  | "text"
  | "number"
  | "tri-state"
  | "single-select"
  | "multi-select"
  | "date"
  | "rating"
  | "percentage"
  | "file"
  | "rich-text"
  | "link"
  | "component";

export interface FeatureSubProperty {
  id: string;
  name: string;
  valueType: "text";
  /** true = inventory item: tracks serial numbers per unit; false = non-inventory: tracks qty + unit price */
  isInventory?: boolean;
  /** unit of measure, e.g. "ea", "m", "kg" */
  unit?: string;
}

export interface ProductFeatureDefinition {
  id: string;
  name: string;
  valueType: ProductFeatureValueType;
  options?: string[];
  subProperties?: FeatureSubProperty[];
  /**
   * Mirrors Feature.isInventory ("Feature: Yes/No" in Settings → Features). Already flowed
   * through at runtime before this field was declared here (WorkInstructions.tsx read it via
   * an inline cast) — this just gives it a real type so Workflow Builder can filter on it
   * without a cast. No DB/API change; the underlying property is unchanged.
   */
  isInventory?: boolean;
}

export interface Product {
  id: string;
  name: string;
  description?: string;
  features?: ProductFeatureDefinition[];
  divisionId?: string;
  divisionName?: string;
}
