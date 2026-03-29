/**
 * networkService - Checks both internet connectivity AND server reachability
 * 
 * Provides clear distinction between:
 * - No internet connection (phone has no WiFi/cellular)
 * - Server unavailable (internet works, but API is down)
 */

import { Capacitor } from "@capacitor/core";
import { Network } from "@capacitor/network";

// Get API base URL the same way api.ts does
const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API_BASE) {
    return import.meta.env.VITE_API_BASE;
  }
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;
  return `${protocol}//${hostname}:4000/api`;
};

export interface NetworkStatus {
  hasInternet: boolean;      // Phone has internet connection
  serverReachable: boolean;  // API server is responding
  status: "online" | "offline" | "server-unavailable";
}

/**
 * Check if phone has internet connection
 */
export async function hasInternetConnection(): Promise<boolean> {
  try {
    if (Capacitor.isNativePlatform()) {
      const status = await Network.getStatus();
      return status.connected;
    } else {
      return navigator.onLine;
    }
  } catch {
    return navigator.onLine;
  }
}

/**
 * Check if the API server is reachable
 * Sends a lightweight HEAD request to check server health
 */
export async function isServerReachable(): Promise<boolean> {
  try {
    // Use a short timeout to quickly detect server issues
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    // Try to reach the API health endpoint or base URL
    const apiUrl = getApiBaseUrl();
    const response = await fetch(`${apiUrl}/health`, {
      method: "HEAD",
      signal: controller.signal,
      cache: "no-store"
    });
    
    clearTimeout(timeoutId);
    return response.ok || response.status < 500;
  } catch (error) {
    // If we get here, server is unreachable (timeout, network error, etc.)
    return false;
  }
}

/**
 * Get comprehensive network status
 * Checks both internet AND server reachability
 */
export async function getNetworkStatus(): Promise<NetworkStatus> {
  const hasInternet = await hasInternetConnection();
  
  if (!hasInternet) {
    return {
      hasInternet: false,
      serverReachable: false,
      status: "offline"
    };
  }
  
  // We have internet, now check if server is reachable
  const serverReachable = await isServerReachable();
  
  return {
    hasInternet: true,
    serverReachable,
    status: serverReachable ? "online" : "server-unavailable"
  };
}

/**
 * Get user-friendly message based on network status
 */
export function getNetworkMessage(status: NetworkStatus): {
  title: string;
  description: string;
} {
  switch (status.status) {
    case "offline":
      return {
        title: "No internet connection",
        description: "First-time login requires internet access. Connect to WiFi or cellular data to sign in."
      };
    case "server-unavailable":
      return {
        title: "Server unavailable",
        description: "Your phone is online but the server is not responding. Please try again later or contact support."
      };
    case "online":
    default:
      return {
        title: "",
        description: ""
      };
  }
}