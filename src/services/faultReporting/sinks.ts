/**
 * Registry of fault report destinations.
 *
 * Today there is one sink: our own API. The registry exists so a hosted service can be
 * added later — write a sink, register it at startup, and capture/UI code stays untouched.
 * Sinks are independent: one failing does not stop the others.
 */
import api from "../api";
import type { FaultReportPayload, FaultReportSink } from "./types";

const sinks: FaultReportSink[] = [];

export function registerFaultReportSink(sink: FaultReportSink): void {
  if (sinks.some((s) => s.name === sink.name)) return;
  sinks.push(sink);
}

export function getFaultReportSinks(): FaultReportSink[] {
  return [...sinks];
}

/** Test helper — keeps registration order predictable between cases. */
export function resetFaultReportSinks(): void {
  sinks.length = 0;
}

/**
 * Sends to our own API. `delivered` is false when every sink failed, which is how the
 * caller knows to queue the report for a later attempt.
 */
export const serverFaultReportSink: FaultReportSink = {
  name: "commtrac-api",
  async send(payload: FaultReportPayload): Promise<void> {
    await api.post("/fault-reports", payload);
  },
};

export async function dispatchToSinks(payload: FaultReportPayload): Promise<boolean> {
  const active = getFaultReportSinks();
  if (active.length === 0) return false;

  const results = await Promise.allSettled(active.map((sink) => sink.send(payload)));
  return results.some((r) => r.status === "fulfilled");
}
