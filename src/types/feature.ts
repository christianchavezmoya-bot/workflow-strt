/** Global feature definition — reusable across products. */
export interface Feature {
  id: string;
  name: string;
  description?: string;
  /** text | number | single-select | multi-select | component | etc. */
  valueType: string;
  options?: string[];
  subProperties?: FeatureSubProperty[];
  /** true = this feature is itself a tracked inventory item */
  isInventory?: boolean;
  /** Inventory only: fields to capture per unit e.g. serialNo, firmware, ipAddress */
  captureFields?: string[];
  /** Procurement fields */
  brand?: string;
  supplier?: string;
  alternativePartNumber?: string;
  manufacturerPartNumber?: string;
  unitPrice?: number;
  productLink?: string;
  linkedProducts?: string[];
}

export interface FeatureSubProperty {
  id: string;
  name: string;
  valueType: string;
  /** true = tracked inventory (serial per unit), false = non-inventory (qty + price) */
  isInventory?: boolean;
  unit?: string;
}
