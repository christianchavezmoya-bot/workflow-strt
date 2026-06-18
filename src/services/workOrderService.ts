import api from "./api";
import type { WorkOrder, WorkOrderStatus, StepCapture, CreateWorkOrderInput } from "../types/workOrder";
import { isMobileNativePlatform } from "../utils/platform";

export interface WorkOrderDto {
  id: string;
  workflowTemplateId: string;
  productId: string;
  jobReference: string;
  status: WorkOrderStatus;
  stepsDataJson: string;
  projectAssetId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

const LS_KEY = (productId: string) => `work_orders_v1_${productId}`;

function fromDto(dto: WorkOrderDto): WorkOrder {
  let stepsData: StepCapture[] = [];
  try { stepsData = JSON.parse(dto.stepsDataJson) || []; } catch {}
  return {
    id: dto.id,
    workflowTemplateId: dto.workflowTemplateId,
    productId: dto.productId,
    jobReference: dto.jobReference,
    status: dto.status,
    stepsData,
    projectAssetId: dto.projectAssetId,
    notes: dto.notes,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

function lsRead(productId: string): WorkOrder[] {
  try {
    const raw = localStorage.getItem(LS_KEY(productId));
    if (raw) return JSON.parse(raw) as WorkOrder[];
  } catch {}
  return [];
}

function lsWrite(productId: string, orders: WorkOrder[]) {
  try { localStorage.setItem(LS_KEY(productId), JSON.stringify(orders)); } catch {}
}

export const workOrderService = {
  async listByProduct(productId: string): Promise<WorkOrder[]> {
    if (!isMobileNativePlatform()) {
      const res = await api.get<WorkOrderDto[]>(`/work-orders/by-product/${productId}`);
      return res.data.map(fromDto);
    }

    try {
      const res = await api.get<WorkOrderDto[]>(`/work-orders/by-product/${productId}`);
      const orders = res.data.map(fromDto);
      lsWrite(productId, orders);
      return orders;
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) return [];
      console.warn("[workOrderService] API unavailable, falling back to localStorage", err);
      return lsRead(productId);
    }
  },

  async create(input: CreateWorkOrderInput): Promise<WorkOrder> {
    const res = await api.post<WorkOrderDto>("/work-orders", {
      workflowTemplateId: input.workflowTemplateId,
      productId: input.productId,
      jobReference: input.jobReference,
      stepsDataJson: input.stepsDataJson,
      projectAssetId: input.projectAssetId ?? null,
      notes: input.notes ?? null,
    });
    const order = fromDto(res.data);
    const existing = lsRead(order.productId);
    lsWrite(order.productId, [order, ...existing]);
    return order;
  },

  async update(id: string, stepsData: StepCapture[], status: WorkOrderStatus): Promise<WorkOrder> {
    const res = await api.put<WorkOrderDto>(`/work-orders/${id}`, {
      status,
      stepsDataJson: JSON.stringify(stepsData),
    });
    return fromDto(res.data);
  },

  async patch(id: string, fields: { jobReference?: string; notes?: string }): Promise<WorkOrder> {
    const res = await api.put<WorkOrderDto>(`/work-orders/${id}`, fields);
    return fromDto(res.data);
  },

  async remove(id: string, productId: string): Promise<void> {
    try { await api.delete(`/work-orders/${id}`); } catch {}
    const existing = lsRead(productId);
    lsWrite(productId, existing.filter((o) => o.id !== id));
  },
};
