/**
 * Display label the workflow generators give a stored capture-field key. TypeScript twin of
 * WorkflowConfigsController.CaptureFieldLabel (server/Commtrac.Api): a few well-known keys map to
 * a friendly label, everything else (including keys that are already human names such as
 * "MAC Address") is used verbatim. Pinned against the server by WorkflowContextIdContractTests.
 */
const KNOWN_CAPTURE_FIELD_LABELS: Record<string, string> = {
  serialNo: "Serial Number",
  firmware: "Firmware Version",
  ipAddress: "IP Address",
  macAddress: "MAC Address",
  model: "Model",
  location: "Location",
};

export function captureFieldLabel(key: string): string {
  return Object.prototype.hasOwnProperty.call(KNOWN_CAPTURE_FIELD_LABELS, key)
    ? KNOWN_CAPTURE_FIELD_LABELS[key]
    : key;
}
