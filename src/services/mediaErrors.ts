/** Thrown when a filesystem-backed media ref cannot be read at sync time. */
export class MediaMissingError extends Error {
  readonly path: string;
  readonly fieldKey?: string;

  constructor(path: string, options?: { fieldKey?: string; cause?: unknown }) {
    super(`Media file missing: ${path}`);
    this.name = "MediaMissingError";
    this.path = path;
    this.fieldKey = options?.fieldKey;
    if (options?.cause instanceof Error) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

export function isMediaMissingError(error: unknown): error is MediaMissingError {
  return error instanceof MediaMissingError;
}
