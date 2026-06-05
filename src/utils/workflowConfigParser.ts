import type { Workflow } from "../types/workflow";
import type { WorkflowConfig } from "../types/workflowConfig";

export function parseWorkflowConfigToWorkflow(config: WorkflowConfig): Workflow | null {
  try {
    const parsed = JSON.parse(config.stepsJson);
    if (parsed && Array.isArray(parsed.steps)) {
      return parsed as Workflow;
    }
    if (Array.isArray(parsed)) {
      return {
        id: config.id,
        name: config.displayName || config.name,
        productId: config.productId,
        createdAt: Date.now(),
        steps: parsed,
        media: [],
      };
    }
  } catch {
    return null;
  }
  return null;
}
