import { Directory, Filesystem } from "@capacitor/filesystem";

const ensuredPaths = new Map<string, Promise<void>>();

/**
 * Ensure a directory under Directory.Data exists once per app session.
 * Uses stat-before-mkdir to avoid OS-PLUG-FILE-0010 noise when the folder
 * already exists. Concurrent callers share the same in-flight promise.
 */
export function ensureNativeDataDir(path: string): Promise<void> {
  const existing = ensuredPaths.get(path);
  if (existing) return existing;

  const promise = (async () => {
    try {
      await Filesystem.stat({ path, directory: Directory.Data });
    } catch {
      try {
        await Filesystem.mkdir({
          path,
          directory: Directory.Data,
          recursive: true,
        });
      } catch {
        // Race with another caller or unsupported — ignore.
      }
    }
  })();

  ensuredPaths.set(path, promise);
  return promise;
}
