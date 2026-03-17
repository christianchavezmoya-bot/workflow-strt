/** Global feature definition — reusable across products. */
export interface Feature {
  id: string;
  name: string;
  description?: string;
  /** text | number | single-select | multi-select | component | etc. */
  valueType: string;
  options?: string[];
  subProperties?: FeatureSubProperty[];
}

export interface FeatureSubProperty {
  id: string;
  name: string;
  valueType: string;
  /** true = tracked inventory (serial per unit), false = non-inventory (qty + price) */
  isInventory?: boolean;
  unit?: string;
}
