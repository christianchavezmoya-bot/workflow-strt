export interface GoodsMovement {
  direction: string;      // "Despatched" | "Received"
  movementRef: string;
  date: string;
  toFrom: string;
  consignmentRef: string;
  jobNumber: string;
  orderRef: string;
  goods: string;
  handledBy: string;
  navPoNumber: string;
  recordId: string;
  rawFields: Record<string, string>;
}

export interface GoodsMovementsResult {
  despatched: GoodsMovement[];
  received: GoodsMovement[];
  realmHostname: string;
  tableId: string;
  filterQuery: string;
}
