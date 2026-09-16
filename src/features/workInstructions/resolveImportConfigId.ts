/**
 * Resolves the WorkflowConfig id that "Import Workflow JSON" should target: the current saved
 * config's id when one already exists, or a freshly-created draft's id (via the Builder's
 * existing ensureConfigId() mechanism) when it doesn't. Never creates a duplicate draft when a
 * config id is already available.
 *
 * A standalone module (rather than inline in WorkflowBuilder.tsx) so this decision can be
 * unit-tested in isolation — importing WorkflowBuilder.tsx itself hangs under Vitest due to a
 * pre-existing @mui/x-date-pickers ESM resolution issue in one of its sub-components.
 */
export async function resolveImportConfigId(
  currentConfigId: string | null | undefined,
  ensureConfigId: () => Promise<string | null>,
): Promise<string | null> {
  if (currentConfigId) return currentConfigId;
  return ensureConfigId();
}
