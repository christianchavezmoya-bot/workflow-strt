/** Fix data URLs browsers/jsPDF cannot render (e.g. server step-media uploads). */
export function normalizeBinaryDataUrl(src: string): string {
  if (!src.startsWith("data:")) return src;
  const comma = src.indexOf(",");
  if (comma < 0) return src;
  const header = src.slice(0, comma).toLowerCase();
  const payload = src.slice(comma + 1);
  if (!header.includes("application/octet-stream") && !header.includes("application/binary")) {
    return src;
  }

  try {
    const sample = atob(payload.slice(0, 32));
    const b0 = sample.charCodeAt(0);
    const b1 = sample.charCodeAt(1);
    const b2 = sample.charCodeAt(2);
    const b3 = sample.charCodeAt(3);
    if (b0 === 0xff && b1 === 0xd8) return `data:image/jpeg;base64,${payload}`;
    if (b0 === 0x89 && b1 === 0x50 && b2 === 0x4e && b3 === 0x47) return `data:image/png;base64,${payload}`;
    if (b0 === 0x47 && b1 === 0x49 && b2 === 0x46) return `data:image/gif;base64,${payload}`;
    if (b0 === 0x52 && b1 === 0x49 && b2 === 0x46 && b3 === 0x46) return `data:image/webp;base64,${payload}`;
  } catch {
    /* fall through */
  }

  return `data:image/jpeg;base64,${payload}`;
}
