/**
 * Fault reporting — public surface.
 *
 * Import from here rather than reaching into the module's files, so the internals
 * (including which sinks exist) can change without touching callers.
 */
export type {
  FaultBreadcrumb,
  FaultKind,
  FaultReportDraft,
  FaultReportPayload,
  FaultReportResult,
  FaultReportSink,
  FaultSeverity,
} from "./types";

export {
  getBreadcrumbs,
  recordActionBreadcrumb,
  recordRouteBreadcrumb,
} from "./breadcrumbs";

export {
  generateFaultReferenceCode,
  normalizeFaultReferenceCode,
} from "./referenceCode";

export {
  buildFaultReportPayload,
  flushPendingFaultReports,
  pendingFaultReportCount,
  submitFaultReport,
} from "./faultReportService";

export { captureFault, installFaultCapture } from "./errorCapture";

export {
  registerFaultReportSink,
  getFaultReportSinks,
  resetFaultReportSinks,
  serverFaultReportSink,
} from "./sinks";
