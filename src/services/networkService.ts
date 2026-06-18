/**
 * networkService - Checks both internet connectivity AND server reachability
 * 
 * Provides clear distinction between:
 * - No internet connection (phone has no WiFi/cellular)
 * - Server unavailable (internet works, but API is down)
 */

import { CapacitorHttp } from "@capacitor/core";
import { Network } from "@capacitor/network";
import { getApiBaseUrl } from "./apiBase";
import { isMobileNativePlatform } from "../utils/platform";

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
    if (isMobileNativePlatform()) {
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
    if (isMobileNativePlatform()) {
      const response = await CapacitorHttp.get({
        url: `${getApiBaseUrl()}/health`,
        connectTimeout: 5000,
        readTimeout: 5000,
        responseType: "json",
      });
      return response.status >= 200 && response.status < 500;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${getApiBaseUrl()}/health`, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeoutId);
    return response.ok || response.status < 500;
  } catch {
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
  const isNativeMobile = isMobileNativePlatform();

  switch (status.status) {
    case "offline":
      return {
        title: "No internet connection",
        description: isNativeMobile
          ? "First-time login requires internet access. Connect to WiFi or cellular data to sign in."
          : "A live internet connection is required to sign in. Check your network and try again."
      };
    case "server-unavailable":
      return {
        title: "Server unavailable",
        description: isNativeMobile
          ? "Your phone is online but the server is not responding. Please try again later or contact support."
          : "Your browser is online but the server is not responding. Check the server address and try again."
      };
    case "online":
    default:
      return {
        title: "",
        description: ""
      };
  }
}
