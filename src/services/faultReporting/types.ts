/**
 * Fault reporting types shared by the capture, queue and sink layers.
 */

/** How the fault reached us. */
export type FaultKind = "user-report" | "crash" | "unhandled-rejection";

/** Impact, mapped from the user's own words in the report dialog. See docs/BUG_TRIAGE.md. */
export type FaultSeverity = "S0" | "S1" | "S2" | "S3" | "S4";

export interface FaultBreadcrumb {
  ts: string;
  /** "route" for navigation, "action" for a deliberate user action. */
  type: "route" | "action";
  label: string;
}

/** What the app knows about a fault before it is sent anywhere. */
export interface FaultReportDraft {
  kind: FaultKind;
  severity: FaultSeverity;
  title: string;
  description?: string;
  error?: { name?: string; message?: string; stack?: string };
  /** Server trace id of the request that failed, when known. */
  traceId?: string;
  /** Set by the caller when the user has already been shown a code. */
  referenceCode?: string;
  occurredAt?: string;
}

/** The request body sent to the API — also what gets queued while offline. */
export interface FaultReportPayload extends Record<string, unknown> {
  kind: FaultKind;
  severity: FaultSeverity;
  title: string;
  description?: string;
  platform: "web" | "native";
  appVersion: string;
  userAgent: string;
  routePath: string;
  errorName?: string;
  errorMessage?: string;
  errorStack?: string;
  traceId?: string;
  breadcrumbsJson?: string;
  diagnosticsJson?: string;
  wasOffline: boolean;
  occurredAtUtc: string;
  clientReferenceCode: string;
}

export interface FaultReportResult {
  referenceCode: string;
  /** False when the report was stored locally to send later. */
  delivered: boolean;
}

/**
 * A destination for fault reports. The app ships a server sink; adding a hosted
 * service later (Sentry or similar) means writing another sink and registering it,
 * with no changes to capture or UI code.
 */
export interface FaultReportSink {
  name: string;
  /** Resolves when handed off. Throw to signal failure so the caller can queue. */
  send(payload: FaultReportPayload): Promise<void>;
}
