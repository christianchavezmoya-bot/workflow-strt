import type { Scene } from "./scenes";

function resolveAssetUrl(relativePath: string): string {
  try {
    return new URL(relativePath, document.baseURI).href;
  } catch {
    return relativePath;
  }
}

/** Pre-loaded narration tracks — one Audio element per scene, reused on play. */
export class NarrationEngine {
  private readonly tracks = new Map<number, HTMLAudioElement>();
  private activeId: number | null = null;

  async loadAll(scenes: Scene[]): Promise<void> {
    await Promise.all(scenes.map((s) => this.loadTrack(s)));
  }

  private loadTrack(scene: Scene): Promise<void> {
    if (this.tracks.has(scene.id)) return Promise.resolve();

    return new Promise((resolve) => {
      const el = new Audio(resolveAssetUrl(scene.audio));
      el.preload = "auto";

      const finish = () => {
        this.tracks.set(scene.id, el);
        resolve();
      };

      el.addEventListener("canplaythrough", finish, { once: true });
      el.addEventListener("error", finish, { once: true });
      el.load();
      setTimeout(finish, 12_000);
    });
  }

  getTrack(sceneId: number): HTMLAudioElement | undefined {
    return this.tracks.get(sceneId);
  }

  stop(): void {
    const el = this.activeId != null ? this.tracks.get(this.activeId) : null;
    if (el) {
      el.pause();
      el.currentTime = 0;
      el.onended = null;
      el.onerror = null;
    }
    this.activeId = null;
  }

  async play(sceneId: number): Promise<HTMLAudioElement | null> {
    this.stop();
    const el = this.tracks.get(sceneId);
    if (!el) return null;

    this.activeId = sceneId;
    el.currentTime = 0;

    if (el.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        el.addEventListener("canplaythrough", done, { once: true });
        el.addEventListener("error", done, { once: true });
        el.load();
        setTimeout(done, 5000);
      });
    }

    try {
      await el.play();
      return el;
    } catch {
      this.activeId = null;
      return null;
    }
  }

  get active(): HTMLAudioElement | null {
    return this.activeId != null ? this.tracks.get(this.activeId) ?? null : null;
  }
}

export const narration = new NarrationEngine();
