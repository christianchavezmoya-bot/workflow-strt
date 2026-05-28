import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
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
        },
      },
    },
  },
  server: {
    port: 5173,
    host: "0.0.0.0", // Listen on all network interfaces
  },
});
