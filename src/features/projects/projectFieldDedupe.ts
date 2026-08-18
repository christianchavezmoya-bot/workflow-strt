/**
 * Dynamic project field definitions that duplicate built-in project columns.
 * Mac DBs accumulated overlaps (e.g. a custom "Project Manager" field alongside
 * the built-in). The list page and the add/edit form both filter these out so
 * the same label never appears twice.
 */

export const PROJECT_BUILTIN_FIELD_IDS = new Set([
  "jobNumber",
  "purchaseOrderNumber",
  "customerName",
  "siteName",
  "customerId",
  "products",
  "office",
  "region",
  "timeZoneId",
  "projectManager",
  "teamMembers",
  "description",
  "startDate",
  "finishDate",
  "status",
  "projectType",
]);

/** Normalized display names that collide with built-in project columns. */
export const PROJECT_DUPLICATE_DYNAMIC_NAMES = new Set([
  "job number",
  "purchase order number",
  "project manager",
  "project team members",
  "team members",
  "customer name",
  "customer",
  "product name",
  "products",
  "site",
  "country/state",
  "description",
  "start date",
  "finish date",
  "status",
  "project type",
  "customer id",
  "office",
  "global offices",
  "global office",
  "time zone",
]);

export function isDuplicateProjectDynamicField(field: { id: string; name: string }): boolean {
  if (PROJECT_BUILTIN_FIELD_IDS.has(field.id)) return true;
  return PROJECT_DUPLICATE_DYNAMIC_NAMES.has(field.name.trim().toLowerCase());
}
