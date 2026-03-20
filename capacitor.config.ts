import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.commtrac.field",
  appName: "Commtrac Field",
  webDir: "dist",
  server: {
    // During development, point to your local dev server so you get hot reload on device
    // Comment this out for production builds
    // url: "http://YOUR_LOCAL_IP:5173",
    // cleartext: true,
  },
};

export default config;
