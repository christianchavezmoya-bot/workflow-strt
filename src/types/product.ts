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
}
