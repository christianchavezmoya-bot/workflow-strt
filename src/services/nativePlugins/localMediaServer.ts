import { registerPlugin } from "@capacitor/core";

/**
 * Bridge to the local, hand-written iOS Capacitor plugin (ios/App/App/LocalMediaServerPlugin.swift)
 * — not an npm package, so there is no upstream type definition to import. Only implemented on iOS;
 * see configMediaCache.ts for why iOS specifically needs this (capacitor:// and http://localhost
 * convertFileSrc URLs are both unreachable by <video>'s AVFoundation-backed loading on iOS — a real
 * loopback HTTP server is the only avenue that actually works there).
 */
export interface LocalMediaServerPlugin {
  /** Resolves a cached config-media relative path (e.g. "offline-config-media/{configId}/{mediaId}.mp4")
   *  to a `http://127.0.0.1:<port>/media/<token>` URL a native <video> element can load/seek. */
  getUrl(options: { path: string }): Promise<{ url: string }>;
}

export const LocalMediaServer = registerPlugin<LocalMediaServerPlugin>("LocalMediaServer");

export default LocalMediaServer;
