import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.christianchavez.kinet',
  appName: 'N-go',
  webDir: 'dist',
  server: {
    androidScheme: 'http',
    cleartext: true,
  },
  plugins: {
    StatusBar: {
      overlaysWebView: false,
      style: 'DARK',
      backgroundColor: '#0b1d24'
    },
    Camera: {
      // Present the native camera sheet instead of the web fallback on device
    },
  }
};

export default config;
