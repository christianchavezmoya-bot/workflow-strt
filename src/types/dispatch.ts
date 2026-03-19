export type DispatchStatus = "Draft" | "Confirmed" | "Packed" | "Shipped" | "Delivered" | "Cancelled";
export type DeliveryEventType = "Confirmed" | "Packed" | "Shipped" | "Delivered" | "Exception";

export interface DispatchLine {
  id: string;
  dispatchOrderId: string;
  partNumber?: string;
  description: string;
  quantity: number;
  unit?: string;
  notes?: string;
}

export interface DeliveryEvent {
  id: string;
  dispatchOrderId: string;
  eventType: DeliveryEventType;
  eventAtUtc: string;
  location?: string;
  notes?: string;
  recordedByName?: string;
}

export interface DispatchOrder {
  id: string;
  projectId: string;
  projectJobNumber?: string;
  deliveryProfileId?: string;
  recipientName?: string;
  recipientAddress?: string;
  status: DispatchStatus;
  reference?: string;
  carrier?: string;
  trackingNumber?: string;
  expectedDeliveryDate?: string;
  createdAtUtc: string;
  lines: DispatchLine[];
  events: DeliveryEvent[];
}

export interface UpsertDispatchOrderRequest {
  projectId: string;
  deliveryProfileId?: string;
  recipientName?: string;
  recipientAddress?: string;
  reference?: string;
  carrier?: string;
  trackingNumber?: string;
  expectedDeliveryDate?: string;
}

export interface UpsertDispatchLineRequest {
  partNumber?: string;
  description: string;
  quantity: number;
  unit?: string;
  notes?: string;
}

export interface AddDeliveryEventRequest {
  eventType: DeliveryEventType;
  location?: string;
  notes?: string;
}
