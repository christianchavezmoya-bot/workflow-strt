import api from "./api";
import type {
  DispatchOrder,
  DispatchLine,
  DeliveryEvent,
  UpsertDispatchOrderRequest,
  UpsertDispatchLineRequest,
  AddDeliveryEventRequest
} from "../types/dispatch";

export const dispatchService = {
  list: (projectId?: string) =>
    api.get<DispatchOrder[]>("/dispatch-orders", { params: projectId ? { projectId } : {} })
      .then(r => r.data),

  get: (id: string) =>
    api.get<DispatchOrder>(`/dispatch-orders/${id}`).then(r => r.data),

  create: (payload: UpsertDispatchOrderRequest) =>
    api.post<DispatchOrder>("/dispatch-orders", payload).then(r => r.data),

  update: (id: string, payload: UpsertDispatchOrderRequest) =>
    api.put<DispatchOrder>(`/dispatch-orders/${id}`, payload).then(r => r.data),

  remove: (id: string) =>
    api.delete(`/dispatch-orders/${id}`),

  // Lines
  addLine: (orderId: string, payload: UpsertDispatchLineRequest) =>
    api.post<DispatchLine>(`/dispatch-orders/${orderId}/lines`, payload).then(r => r.data),

  updateLine: (orderId: string, lineId: string, payload: UpsertDispatchLineRequest) =>
    api.put<DispatchLine>(`/dispatch-orders/${orderId}/lines/${lineId}`, payload).then(r => r.data),

  removeLine: (orderId: string, lineId: string) =>
    api.delete(`/dispatch-orders/${orderId}/lines/${lineId}`),

  // Events
  addEvent: (orderId: string, payload: AddDeliveryEventRequest) =>
    api.post<DeliveryEvent>(`/dispatch-orders/${orderId}/events`, payload).then(r => r.data),
};
