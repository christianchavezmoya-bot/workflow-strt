import api from "./api";
import type { WorkInstruction, WorkInstructionInput } from "../types/workInstruction";

// ------------------------------------------------------------------
// DTO shape from backend
// ------------------------------------------------------------------

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

// ------------------------------------------------------------------
// LocalStorage fallback (offline / API unavailable)
// ------------------------------------------------------------------

const LS_KEY = "work_instructions_v1";

function lsReadAll(): WorkInstruction[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WorkInstruction[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item?.id && item?.productId && item?.title && Array.isArray(item?.steps));
  } catch {
    return [];
  }
}

function lsWriteAll(items: WorkInstruction[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(items)); } catch {}
}

// ------------------------------------------------------------------
// DTO → domain model
// ------------------------------------------------------------------

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

// ------------------------------------------------------------------
// Service
// ------------------------------------------------------------------

export const workInstructionService = {
  async listByProduct(productId: string): Promise<WorkInstruction[]> {
    try {
      const res = await api.get<WorkInstructionDto[]>(`/work-instructions/by-product/${productId}`);
      const items = res.data.map(fromDto);
      const others = lsReadAll().filter((item) => item.productId !== productId);
      lsWriteAll([...others, ...items]);
      return items;
    } catch {
      return lsReadAll()
        .filter((item) => item.productId === productId)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }
  },

  async create(productId: string, input: WorkInstructionInput): Promise<WorkInstruction> {
    try {
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
      const item = fromDto(res.data);
      lsWriteAll([item, ...lsReadAll()]);
      return item;
    } catch {
      const item: WorkInstruction = {
        id: crypto.randomUUID ? crypto.randomUUID() : `wi-${Date.now()}`,
        productId,
        title: input.title.trim(),
        summary: input.summary?.trim() || undefined,
        steps: input.steps,
        status: input.status,
        featureValues: input.featureValues,
        updatedAt: new Date().toISOString(),
      };
      lsWriteAll([item, ...lsReadAll()]);
      return item;
    }
  },

  async update(id: string, input: WorkInstructionInput): Promise<WorkInstruction> {
    try {
      const res = await api.put<WorkInstructionDto>(`/work-instructions/${id}`, {
        title: input.title.trim(),
        summary: input.summary?.trim() || null,
        stepsJson: JSON.stringify(input.steps),
        status: input.status,
        featureValuesJson: JSON.stringify(input.featureValues),
      });
      const item = fromDto(res.data);
      const all = lsReadAll();
      const idx = all.findIndex((x) => x.id === id);
      if (idx >= 0) all[idx] = item; else all.unshift(item);
      lsWriteAll(all);
      return item;
    } catch {
      const all = lsReadAll();
      const idx = all.findIndex((x) => x.id === id);
      if (idx < 0) throw new Error("Work instruction not found.");
      const updated: WorkInstruction = {
        ...all[idx],
        title: input.title.trim(),
        summary: input.summary?.trim() || undefined,
        steps: input.steps,
        status: input.status,
        featureValues: input.featureValues,
        updatedAt: new Date().toISOString(),
      };
      all[idx] = updated;
      lsWriteAll(all);
      return updated;
    }
  },

  async remove(id: string): Promise<string> {
    try {
      await api.delete(`/work-instructions/${id}`);
    } catch { /* best effort */ }
    lsWriteAll(lsReadAll().filter((x) => x.id !== id));
    return id;
  },
};
