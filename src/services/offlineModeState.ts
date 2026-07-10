// Single source of truth for "treat the app as offline" outside React.
// React providers update this module; service/interceptor code reads from it.

let offlineModeActive = false;

export function setOfflineModeActive(value: boolean): void {
  offlineModeActive = value;
}

export function isOfflineModeActive(): boolean {
  return offlineModeActive;
}
