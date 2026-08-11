import os from "node:os";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function resolveLanHmrHost(): string | undefined {
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family !== "IPv4" || address.internal) continue;
      if (
        address.address.startsWith("10.")
        || address.address.startsWith("192.168.")
        || /^172\.(1[6-9]|2\d|3[0-1])\./.test(address.address)
      ) {
        return address.address;
      }
    }
  }
  return undefined;
}

export default defineConfig(() => {
  const preferredHmrHost = process.env.VITE_HMR_HOST || resolveLanHmrHost();
  const preferredHmrClientPort = Number(process.env.VITE_HMR_CLIENT_PORT || 5173);
  const disableHmr = process.env.VITE_DISABLE_HMR === "true";

  return {
    plugins: [react()],
    build: {
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return;

            if (
              id.includes("pdfjs-dist") ||
              id.includes("jspdf") ||
              id.includes("jspdf-autotable") ||
              id.includes("html2canvas")
            ) {
              return "pdf-reporting";
            }

            if (id.includes("xlsx") || id.includes("mammoth") || id.includes("docx")) {
              return "document-tools";
            }

            if (id.includes("@capacitor") || id.includes("capacitor-")) {
              return "capacitor";
            }

            if (id.includes("leaflet") || id.includes("react-leaflet")) {
              return "maps";
            }

            if (id.includes("chart.js")) {
              return "chartjs";
            }
          },
        },
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      host: "0.0.0.0",
      hmr: disableHmr ? false : {
        host: preferredHmrHost,
        clientPort: preferredHmrClientPort,
        protocol: "ws",
      },
    },
  };
});
