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
}

export interface Product {
  id: string;
  name: string;
  description?: string;
  features?: ProductFeatureDefinition[];
  divisionId?: string;
  divisionName?: string;
}
