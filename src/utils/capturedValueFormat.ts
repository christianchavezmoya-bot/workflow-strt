import { normalizeBinaryDataUrl } from "./reportMediaResolve";

function decodeBase64Utf8(payload: string): string | null {
  try {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return null;
  }
}

function decodeDataUrlText(value: string): { mimeType: string; text: string } | null {
  const match = value.match(/^data:([^;,]+)?((?:;[^;,=]+=[^;,]+)*)(;base64)?,(.*)$/i);
  if (!match) return null;

  const mimeType = (match[1] ?? "text/plain").toLowerCase();
  if (!mimeType.startsWith("text/")) return null;

  const encodedPayload = match[4] ?? "";
  const text = match[3]
    ? decodeBase64Utf8(encodedPayload)
    : (() => {
        try {
          return decodeURIComponent(encodedPayload);
        } catch {
          return encodedPayload;
        }
      })();

  if (text == null) return null;
  return { mimeType, text };
}

function stripHtmlToText(html: string): string {
  const withBreaks = html
    .replace(/<(br|\/p|\/div|\/li|\/tr)\b[^>]*>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "- ")
    .replace(/<\/(td|th)>/gi, " ");

  if (typeof document !== "undefined") {
    const el = document.createElement("div");
    el.innerHTML = withBreaks;
    const text = el.textContent ?? el.innerText ?? "";
    return text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  }

  return withBreaks
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeCapturedValueForDisplay(value: string | undefined | null): string {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";

  const normalized = normalizeBinaryDataUrl(trimmed);
  const decoded = decodeDataUrlText(normalized);
  if (!decoded) return normalized;

  if (decoded.mimeType === "text/html" || decoded.mimeType === "text/xml") {
    return stripHtmlToText(decoded.text);
  }

  return decoded.text.trim();
}

export function isRenderableImageValue(value: string | undefined | null): boolean {
  const normalized = normalizeBinaryDataUrl(String(value ?? "").trim());
  return normalized.startsWith("data:image/") || normalized.startsWith("offline-media-ref:");
}
