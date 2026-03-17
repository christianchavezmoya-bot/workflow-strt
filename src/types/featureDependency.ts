export interface FeatureDependency {
  id: string;
  featureId: string;
  name: string;
  /** true = inventory (serialized per unit), false = non-inventory (qty + price) */
  isInventory: boolean;
  /** Inventory only: field names to capture e.g. ["serialNo","firmware","ipAddress","macAddress"] */
  captureFields: string[];
  /** Non-inventory only */
  defaultQty: number;
  unit?: string;
  unitPrice: number;
  sortOrder: number;
}
