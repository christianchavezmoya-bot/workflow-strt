import api from "./api";
import type { WorkInstruction, WorkInstructionInput } from "../types/workInstruction";

interface WorkInstructionDto {
  id: string;
  productId: string;
  title: string;
  summary?: string | null;
  stepsJson: string;
  status: string;
  featureValuesJson: string;
  createdAt: string;
  updatedAt: string;
}

function fromDto(dto: WorkInstructionDto): WorkInstruction {
  let steps: string[] = [];
  let featureValues: Record<string, string> = {};
  try { steps = JSON.parse(dto.stepsJson) ?? []; } catch {}
  try { featureValues = JSON.parse(dto.featureValuesJson) ?? {}; } catch {}
  return {
    id: dto.id,
    productId: dto.productId,
    title: dto.title,
    summary: dto.summary ?? undefined,
    steps,
    status: dto.status as WorkInstruction["status"],
    featureValues,
    updatedAt: dto.updatedAt,
  };
}

export const workInstructionService = {
  async listByProduct(productId: string): Promise<WorkInstruction[]> {
    const res = await api.get<WorkInstructionDto[]>(`/work-instructions/by-product/${productId}`);
    return res.data.map(fromDto);
  },

  async create(productId: string, input: WorkInstructionInput): Promise<WorkInstruction> {
    const res = await api.post<WorkInstructionDto>(
      `/work-instructions?productId=${encodeURIComponent(productId)}`,
      {
        title: input.title.trim(),
        summary: input.summary?.trim() || null,
        stepsJson: JSON.stringify(input.steps),
        status: input.status,
        featureValuesJson: JSON.stringify(input.featureValues),
      }
    );
    return fromDto(res.data);
  },

  async update(id: string, input: WorkInstructionInput): Promise<WorkInstruction> {
    const res = await api.put<WorkInstructionDto>(`/work-instructions/${id}`, {
      title: input.title.trim(),
      summary: input.summary?.trim() || null,
      stepsJson: JSON.stringify(input.steps),
      status: input.status,
      featureValuesJson: JSON.stringify(input.featureValues),
    });
    return fromDto(res.data);
  },

  async remove(id: string): Promise<string> {
    await api.delete(`/work-instructions/${id}`);
    return id;
  },
};
