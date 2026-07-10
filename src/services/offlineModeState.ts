// Shared non-React state for connectivity decisions.
// `offlineModeActive` is the broad UI truth ("show offline state").
// `manualOfflineActive` is narrower and only means the user explicitly forced
// offline mode, which is safe for the API fast-skip path.

let offlineModeActive = false;
let manualOfflineActive = false;

export function setOfflineModeActive(value: boolean): void {
  offlineModeActive = value;
}

export function isOfflineModeActive(): boolean {
  return offlineModeActive;
}

export function setManualOfflineModeActive(value: boolean): void {
  manualOfflineActive = value;
}

export function isManualOfflineModeActive(): boolean {
  return manualOfflineActive;
}
