/** True when the server rejected a customer signature because installer is not recorded yet. */
export function isSignatureOrderingError(message: string): boolean {
  return message.toLowerCase().includes("installer must sign");
}

/** True when the server says this role already signed / run is past that step. */
export function isSignatureAlreadyAppliedError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("not awaiting installer signature")
    || lower.includes("not awaiting customer")
    || lower.includes("already signed")
  );
}
