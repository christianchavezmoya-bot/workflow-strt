export const WORKFLOW_IMAGE_MAX_DIM = 1600;
export const WORKFLOW_IMAGE_JPEG_QUALITY = 0.82;

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
  return file.type.startsWith("image/") ? await compressWorkflowImage(file) : file;
}
