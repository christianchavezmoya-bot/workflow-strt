import { Capacitor, registerPlugin } from "@capacitor/core";

interface LocalMediaServerPlugin {
  getPlaybackUrl(options: { uri: string; mimeType?: string }): Promise<{ url: string }>;
}

const NativeLocalMediaServer = registerPlugin<LocalMediaServerPlugin>("LocalMediaServer");

/**
 * iOS-only: register a cached file with the loopback HTTP server so AVFoundation
 * can stream it with Range support. Android continues to use convertFileSrc().
 */
export async function getLocalVideoPlaybackUrl(uri: string, mimeType?: string): Promise<string | null> {
  if (Capacitor.getPlatform() !== "ios") return null;
  try {
    const result = await NativeLocalMediaServer.getPlaybackUrl({ uri, mimeType });
    return result.url ?? null;
  } catch (error) {
    console.error("[localMediaServer] getPlaybackUrl failed — offline video will not play", error);
    return null;
  }
}
