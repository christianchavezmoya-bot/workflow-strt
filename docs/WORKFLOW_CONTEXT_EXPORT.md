# Workflow Context Export

Workflow Actions → **Export Workflow Context** downloads `workflow-context-<configId>.json`: the
authoring aid for the loop *New Workflow → select Features → Export Context → generate a workflow
file externally → Import → Publish*. The external author needs the **identity and structure** of
Features, dependencies and capture fields — not just their display text.

## Pipeline

| Step | Where |
|---|---|
| Menu item | `src/features/workInstructions/WorkflowActionsMenu.tsx` (`onExportContext`) |
| Handler | `WorkflowBuilder.tsx` → `handleExportWorkflowContext()` |
| Product master data | `GET /api/products/{id}/workflow-context` → `ProductsController.GetWorkflowContext` (`ProductWorkflowContextDto`) |
| Persisted inclusion toggles | `workflowConfigFeatureService.getByConfig` → `inclusionsByFeatureFromRows` |
| Assembly (client) | `workflowContextExportAssembly.ts` → `assembleAuthoringContextFromBuilderState` |
| Types | `src/types/workflowAuthoringContext.ts` (mirrors `WorkflowAuthoringContextDto`) |
| DB-authoritative twin | `GET /api/workflow-configs/{id}/authoring-context` → `WorkflowConfigsController.GetAuthoringContext` / `BuildAuthoringStructure` |
| Deterministic ids | `src/utils/deterministicId.ts` ⇔ `WorkflowConfigsController.DeterministicId` |

The Builder uses **live** selections (quantities on screen), so an unsaved workflow still exports
what the user sees. The `authoring-context` endpoint reads the persisted config instead.

## What was lost (before)

`features[]` carried only `captureFields: string[]` (keys, de-duplicated **across** dependencies) and
`dependencyIds: string[]`. Missing: dependency names/configuration, which dependency a capture field
belongs to, field labels/types/required flags, the ids generation assigns, Feature options /
valueType / sub-properties / description / link, and per-dependency inclusion state.

## Schema (still `schemaVersion: 1`, purely additive)

Every original member keeps its exact shape **and** meaning. New members are optional to consume —
feature-detect them (`feature.dependencies?.length`). No version bump was needed because nothing
existing changed; a bump would force every reader to change for no benefit.

Per exported Feature (only Features with quantity > 0):

- **Identity/config:** `description`, `valueType`, `isInventory`, `sortOrder`, `options`,
  `subProperties`, `productLink`, `partNumber` (alternative else manufacturer, as generation
  resolves it), `partNumberField`.
- **`dependencies[]`** (ordered by `sortOrder`): `dependencyId`, `name`, `featureId`, `featureName`,
  `isInventory`, `generatedStepType` (`installation` | `data-collection`), `defaultQty`, `unit`,
  `unitPrice`, `sortOrder`, `included` (`true`/`false`, or `null` = no inclusion state recorded),
  and its `captureFields[]`.
- **`captureFieldSource`:** `"dependencies"` (real dependencies exist) | `"feature"` (Feature-level
  fallback, owned by a synthetic dependency whose id equals the Feature id) | `"none"`.
- **`captureFieldDefinitions[]`:** the flat, ordered list generation resolves.
- **`generatedSteps[]`:** per unit and step type: `unitIndex`, `stepType`, `generatorKey`, `stepId`.

Per capture field: `key`, `label` (server's `CaptureFieldLabel` rule), `type` (`text` for configured
keys, `number` for a non-inventory dependency's quantity field), `required`, `order`, `source`,
`featureId`/`featureName`, `dependencyId`/`dependencyName`, a unit-independent `identity`
(`feature:<featureId>:dep:<dependencyId>:key:<key>`), and `generatedFieldIds[]` — the exact
per-unit ids Publish / Sync / Import assign (empty when generation would not produce the field:
excluded dependency, non-inventory Feature fallback).

### What is *not* in this model
The Feature/dependency master data stores a capture field as a **key string** only. The context
therefore reports `type`/`required`/`label` as *generation resolves them*; it does not invent
min/max, validation, placeholder, unit or media-capture settings, which do not exist at this layer
(media and per-step field configuration live in the workflow JSON — Export Workflow JSON).

## Keeping the two implementations honest

- `server/Commtrac.Api.Tests/Fixtures/workflow-context-parity.json` is **generated from the real
  backend endpoints** by `WorkflowAuthoringContextParityTests`. The backend test fails if the endpoint
  drifts from it; `workflowContextExportParity.test.ts` fails if the client assembler no longer
  reproduces it. Regenerate after an intentional change:
  `UPDATE_CONTEXT_GOLDEN=1 dotnet test --filter WorkflowAuthoringContextParityTests`.
- `WorkflowContextIdContractTests` and `deterministicId.test.ts` share reference vectors produced by
  the .NET runtime, so the SHA-256/`Guid` id derivation cannot drift.
