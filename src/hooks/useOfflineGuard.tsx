/**
 * useOfflineGuard — Hook to block or warn about sensitive actions when offline.
 * 
 * Usage:
 *   const { requireOnline, isOffline, showOfflineDialog, closeOfflineDialog } = useOfflineGuard();
 *   
 *   const handleSensitiveAction = () => {
 *     if (!requireOnline()) return; // Shows dialog if offline
 *     // ... proceed with action
 *   };
 */

import { useState, useEffect, useCallback } from "react";

export interface OfflineGuardResult {
  isOffline: boolean;
  showOfflineDialog: boolean;
  offlineMessage: string | null;
  closeOfflineDialog: () => void;
  requireOnline: (action?: string) => boolean;
  showOfflineWarning: (action?: string) => void;
}

// Actions that should be blocked when offline
export const OFFLINE_BLOCKED_ACTIONS: Record<string, string> = {
  "user-management": "User management requires an internet connection.",
  "password-change": "Changing password requires an internet connection.",
  "permission-change": "Modifying permissions requires an internet connection.",
  "2fa-setup": "Two-factor authentication setup requires an internet connection.",
  "2fa-disable": "Disabling two-factor authentication requires an internet connection.",
  "account-deletion": "Account deletion requires an internet connection.",
  "data-export": "Exporting confidential data requires an internet connection.",
  "admin-actions": "Administrative actions require an internet connection.",
  "final-approval": "Final approvals require an internet connection.",
};

export function useOfflineGuard(): OfflineGuardResult {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showOfflineDialog, setShowOfflineDialog] = useState(false);
  const [offlineMessage, setOfflineMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const closeOfflineDialog = useCallback(() => {
    setShowOfflineDialog(false);
    setOfflineMessage(null);
  }, []);

  const showOfflineWarning = useCallback((action?: string) => {
    const message = action && OFFLINE_BLOCKED_ACTIONS[action]
      ? OFFLINE_BLOCKED_ACTIONS[action]
      : "This action requires an internet connection. Please connect to a network and try again.";
    
    setOfflineMessage(message);
    setShowOfflineDialog(true);
  }, []);

  const requireOnline = useCallback((action?: string): boolean => {
    if (!isOffline) return true;
    
    showOfflineWarning(action);
    return false;
  }, [isOffline, showOfflineWarning]);

  return {
    isOffline,
    showOfflineDialog,
    offlineMessage,
    closeOfflineDialog,
    requireOnline,
    showOfflineWarning,
  };
}

export default useOfflineGuard;