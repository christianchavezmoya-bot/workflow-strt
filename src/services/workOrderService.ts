import api from "./api";
import type { WorkOrder, WorkOrderStatus, StepCapture, CreateWorkOrderInput } from "../types/workOrder";

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

export const workOrderService = {
  async listByProduct(productId: string): Promise<WorkOrder[]> {
    const res = await api.get<WorkOrderDto[]>(`/work-orders/by-product/${productId}`);
    return res.data.map(fromDto);
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
    return fromDto(res.data);
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

  async remove(id: string, _productId: string): Promise<void> {
    await api.delete(`/work-orders/${id}`);
  },
};
