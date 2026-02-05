import axios from "axios";

// Automatically determine API base URL based on current hostname
const getApiBaseUrl = () => {
  // If VITE_API_BASE is explicitly set, use it
  if (import.meta.env.VITE_API_BASE) {
    return import.meta.env.VITE_API_BASE;
  }

  // Otherwise, use the same host as the frontend
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;
  return `${protocol}//${hostname}:4000/api`;
};

const api = axios.create({
  baseURL: getApiBaseUrl(),
  headers: {
    "Content-Type": "application/json"
  }
});

type DebugLog = {
  id: string;
  time: string;
  method?: string;
  url?: string;
  status?: number;
  durationMs?: number;
  error?: string;
};

const pushDebugLog = (log: DebugLog) => {
  const anyWindow = window as typeof window & { __apiDebugLogs?: DebugLog[] };
  if (!anyWindow.__apiDebugLogs) {
    anyWindow.__apiDebugLogs = [];
  }
  anyWindow.__apiDebugLogs.push(log);
  if (anyWindow.__apiDebugLogs.length > 100) {
    anyWindow.__apiDebugLogs.shift();
  }
  window.dispatchEvent(new Event("api-debug-log"));
};

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("auth_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  (config as typeof config & { metadata?: { start: number } }).metadata = { start: Date.now() };
  return config;
});

api.interceptors.response.use(
  (response) => {
    const meta = (response.config as typeof response.config & { metadata?: { start: number } }).metadata;
    const durationMs = meta?.start ? Date.now() - meta.start : undefined;
    pushDebugLog({
      id: crypto.randomUUID(),
      time: new Date().toLocaleTimeString(),
      method: response.config.method?.toUpperCase(),
      url: response.config.url,
      status: response.status,
      durationMs
    });
    return response;
  },
  (error) => {
    const status = error?.response?.status;
    const config = error?.config || {};
    const meta = (config as typeof config & { metadata?: { start: number } }).metadata;
    const durationMs = meta?.start ? Date.now() - meta.start : undefined;
    pushDebugLog({
      id: crypto.randomUUID(),
      time: new Date().toLocaleTimeString(),
      method: config.method?.toUpperCase(),
      url: config.url,
      status,
      durationMs,
      error: error?.message
    });
    if (status === 401) {
      window.location.href = "/login";
    }
    if (status >= 500) {
      console.error("Server error", error);
    }
    return Promise.reject(error);
  }
);

export default api;
