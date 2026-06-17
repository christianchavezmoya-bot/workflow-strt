export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function openPrintWindow(html: string, autoPrint = false): Window | null {
  const win = window.open("", "_blank", "noopener,noreferrer");
  if (!win) {
    console.warn("[printWindow] Popup was blocked — allow popups for this site to enable printing.");
    return null;
  }

  win.document.open();
  win.document.write(html);
  win.document.close();

  if (autoPrint) {
    const triggerPrint = () => {
      win.focus();
      win.print();
    };

    win.addEventListener("load", () => window.setTimeout(triggerPrint, 100), { once: true });
    window.setTimeout(triggerPrint, 300);
  }

  return win;
}

export function openObjectUrl(url: string, options?: { autoPrint?: boolean; revokeDelayMs?: number }): Window | null {
  const { autoPrint = false, revokeDelayMs = 60_000 } = options ?? {};
  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (!win) {
    console.warn("[printWindow] Popup was blocked — allow popups for this site to enable PDF preview.");
    return null;
  }

  const revoke = () => window.setTimeout(() => URL.revokeObjectURL(url), revokeDelayMs);

  if (autoPrint) {
    const triggerPrint = () => {
      win.focus();
      win.print();
      revoke();
    };

    win.addEventListener("load", () => window.setTimeout(triggerPrint, 150), { once: true });
    window.setTimeout(triggerPrint, 500);
  } else {
    revoke();
  }

  return win;
}
