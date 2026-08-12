/** Shared document preview helpers (file-type routing, page sizing). */

import { getFileExtension } from "./documentFileTypes";

export const DOCX_PAGE_WIDTH_PX = 816;
export const DOCX_PAGE_HEIGHT_PX = 1056;

export function getDocumentPreviewFileType(contentType?: string | null, name?: string): string | undefined {
  const type = (contentType ?? "").toLowerCase();
  const ext = getFileExtension(name);

  if (type.includes("pdf") || ext === "pdf") return "pdf";
  if (type.startsWith("image/")) return ext ?? "jpg";
  if (type.startsWith("video/")) return ext ?? "mp4";

  if (ext === "dwg" || ext === "dxf") return ext;
  if (ext === "xlsx" || ext === "xls") return ext;
  if (ext === "docx") return "docx";
  if (ext === "doc") return "doc";

  if (type.includes("spreadsheet") || type.includes("sheet") || type.includes("excel")) return "xlsx";
  if (type.includes("wordprocessingml") || type.includes("word") || type.includes("msword")) {
    return ext === "doc" ? "doc" : "docx";
  }
  if (type.includes("json") || ext === "json") return "json";
  if (type.startsWith("text/")) return ext ?? "txt";
  return ext;
}
