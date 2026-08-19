export const WORKFLOW_IMAGE_MAX_DIM = 1600;
export const WORKFLOW_IMAGE_JPEG_QUALITY = 0.82;

/**
 * Hard cap for workflow-run video captures (phone library + camera).
 *
 * Videos are still embedded as base64 data URLs inside stepResultsJson and
 * POSTed via saveProgress, which uses the default ~30 MB Kestrel body limit
 * (unlike /step-media which allows 250 MB). Base64 expands size by ~33%, so
 * a 15 MB file becomes ~20 MB of JSON payload — leaving headroom for other
 * step fields. Larger library clips commonly OOM the native WebView on Continue.
 *
 * Builder template media uses a separate 100 MB multipart path; do not raise
 * this runner limit without also switching runner uploads off the data-URL path.
 */
export const WORKFLOW_VIDEO_MAX_BYTES = 15 * 1024 * 1024;

export class WorkflowMediaTooLargeError extends Error {
  readonly fileName: string;
  readonly fileBytes: number;
  readonly maxBytes: number;

  constructor(fileName: string, fileBytes: number, maxBytes = WORKFLOW_VIDEO_MAX_BYTES) {
    super(formatWorkflowVideoTooLargeMessage(fileName, fileBytes, maxBytes));
    this.name = "WorkflowMediaTooLargeError";
    this.fileName = fileName;
    this.fileBytes = fileBytes;
    this.maxBytes = maxBytes;
  }
}

export function formatBytesLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatWorkflowVideoTooLargeMessage(
  fileName: string,
  fileBytes: number,
  maxBytes = WORKFLOW_VIDEO_MAX_BYTES,
): string {
  const name = fileName?.trim() || "Video";
  return `${name} is ${formatBytesLabel(fileBytes)} — max ${formatBytesLabel(maxBytes)}. Record a shorter clip, or compress/crop the video and try again.`;
}

/** Returns an error message when the file is a video over the runner limit; otherwise null. */
export function getWorkflowVideoSizeError(file: File, maxBytes = WORKFLOW_VIDEO_MAX_BYTES): string | null {
  const isVideo = file.type.startsWith("video/")
    || /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(file.name);
  if (!isVideo) return null;
  if (file.size <= maxBytes) return null;
  return formatWorkflowVideoTooLargeMessage(file.name, file.size, maxBytes);
}

export function assertWorkflowVideoAllowed(file: File, maxBytes = WORKFLOW_VIDEO_MAX_BYTES): void {
  const message = getWorkflowVideoSizeError(file, maxBytes);
  if (message) {
    throw new WorkflowMediaTooLargeError(file.name, file.size, maxBytes);
  }
}

export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function dataUrlToFile(dataUrl: string, fileName: string): File {
  const [meta, content = ""] = dataUrl.split(",", 2);
  const mimeMatch = meta.match(/^data:([^;]+);base64$/i);
  const mimeType = mimeMatch?.[1] ?? "application/octet-stream";
  const binary = atob(content);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], fileName, { type: mimeType });
}

export async function compressWorkflowImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  return await new Promise<File>((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, WORKFLOW_IMAGE_MAX_DIM / Math.max(img.width, img.height));
      const width = Math.max(1, Math.round(img.width * scale));
      const height = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
        },
        "image/jpeg",
        WORKFLOW_IMAGE_JPEG_QUALITY,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };
    img.src = objectUrl;
  });
}

export async function prepareWorkflowMediaFile(file: File): Promise<File> {
  assertWorkflowVideoAllowed(file);
  return file.type.startsWith("image/") ? await compressWorkflowImage(file) : file;
}
