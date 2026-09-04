import { useEffect, useRef, useState } from "react";
import { Box, CircularProgress, Stack, Typography } from "@mui/material";
import * as pdfjsLib from "pdfjs-dist";
import { usePinchZoom } from "../../hooks/usePinchZoom";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

/** pdf.js requires this URL to end with a trailing slash. */
const STANDARD_FONT_DATA_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/standard_fonts/`;

function previewLoadErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "Could not render PDF preview.";
}

type Props = {
  blob: Blob;
  zoom?: number;
  /** Hint shown above the scroll area on narrow screens */
  scrollHint?: string;
};

/**
 * Scrollable PDF preview.
 *
 * Always renders every page as stacked pdf.js canvases with pinch/scroll support —
 * a browser-native iframe viewer only reliably shows page 1 and doesn't scroll/zoom
 * multi-page PDFs consistently across platforms. The iframe is kept only as a
 * last-resort fallback when pdf.js itself fails to render (see the error branch below).
 */
export default function PdfBlobPreview({ blob, zoom: zoomProp = 1, scrollHint }: Props) {
  const pagesRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [pinchZoom, setPinchZoom] = useState(1);
  const effectiveZoom = zoomProp * pinchZoom;

  const viewportRef = usePinchZoom<HTMLDivElement>({
    zoom: pinchZoom,
    onZoomChange: setPinchZoom,
    enabled: !loading,
  });

  useEffect(() => {
    const nextUrl = URL.createObjectURL(blob);
    setBlobUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [blob]);

  useEffect(() => {
    setPinchZoom(1);
  }, [blob]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void blob.arrayBuffer().then((data) => {
      if (!cancelled) setPdfData(data);
    }).catch(() => {
      if (!cancelled) setError("Could not read PDF data.");
    });
    return () => { cancelled = true; };
  }, [blob]);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    let frame = 0;
    const resizeObserver = new ResizeObserver((entries) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = Math.round(entries[0]?.contentRect.width ?? 0);
        // Guard against sub-pixel float jitter from getBoundingClientRect/ResizeObserver
        // reporting a fractionally different width across ticks with no real layout change
        // — rounding is standard hygiene here, not a debounce over the actual bug (see
        // `scrollbarGutter: "stable"` below for the real fix).
        setContainerWidth((prev) => (prev === next ? prev : next));
      });
    });
    resizeObserver.observe(node);
    setContainerWidth(Math.round(node.getBoundingClientRect().width));
    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
    };
  }, [viewportRef]);

  useEffect(() => {
    let cancelled = false;

    async function renderPdf() {
      if (!pdfData || pdfData.byteLength === 0 || !pagesRef.current || containerWidth <= 0) return;

      const host = pagesRef.current;
      host.innerHTML = "";
      setPageCount(0);
      setLoading(true);
      setError(null);

      try {
        const loadingTask = pdfjsLib.getDocument({
          data: pdfData.slice(0),
          disableFontFace: true,
          standardFontDataUrl: STANDARD_FONT_DATA_URL,
        });
        const pdf = await loadingTask.promise;
        if (cancelled) {
          void loadingTask.destroy();
          return;
        }

        setPageCount(pdf.numPages);

        for (let index = 1; index <= pdf.numPages; index += 1) {
          const page = await pdf.getPage(index);
          if (cancelled) break;

          const baseViewport = page.getViewport({ scale: 1 });
          const fittedScale = Math.max(0.35, ((containerWidth - 32) / baseViewport.width) * effectiveZoom);
          const viewport = page.getViewport({ scale: fittedScale });

          const shell = document.createElement("div");
          shell.style.margin = "0 auto 16px";
          shell.style.width = `${viewport.width}px`;
          shell.style.maxWidth = "100%";
          shell.style.borderRadius = "8px";
          shell.style.overflow = "hidden";
          shell.style.boxShadow = "0 8px 24px rgba(0,0,0,0.25)";
          shell.style.background = "#fff";

          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d", { alpha: false });
          if (!context) continue;

          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          canvas.style.display = "block";
          canvas.style.width = "100%";
          canvas.style.height = "auto";

          shell.appendChild(canvas);
          host.appendChild(shell);

          await page.render({ canvas, canvasContext: context, viewport } as never).promise;
        }
      } catch (err) {
        if (!cancelled) {
          host.innerHTML = "";
          setError(previewLoadErrorMessage(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void renderPdf();
    return () => { cancelled = true; };
  }, [pdfData, containerWidth, effectiveZoom]);

  const hintText = scrollHint ?? (pageCount > 1 ? "Scroll to view all pages. Pinch to zoom." : "Pinch to zoom.");

  return (
    <Box
      ref={viewportRef}
      sx={{
        height: "100%",
        overflow: "auto",
        // Root cause of the "flashes and never finishes rendering" bug: this element is
        // both the ResizeObserver target above AND the scrollable container whose content
        // (the rendered page canvases) grows as pages are appended. Without a reserved
        // gutter, a vertical scrollbar appears once content overflows, narrowing this
        // element's measured contentRect.width; the render effect below depends on that
        // width and does a full host.innerHTML="" + rebuild on every change, which
        // transiently empties the content, makes the scrollbar disappear, widens the
        // element again, and re-triggers — an unbounded resize/render feedback loop.
        // Reserving the scrollbar's space unconditionally keeps the measured width
        // constant regardless of whether content currently overflows, breaking the loop
        // at its source rather than masking it with a timer/debounce.
        scrollbarGutter: "stable",
        WebkitOverflowScrolling: "touch",
        touchAction: "pan-x pan-y",
        bgcolor: "#525659",
        px: 1,
        py: 1.5,
      }}
    >
      {scrollHint && (
        <Typography variant="caption" sx={{ display: "block", textAlign: "center", color: "rgba(255,255,255,0.75)", mb: 1 }}>
          {hintText}
        </Typography>
      )}
      {loading && (
        <Stack alignItems="center" justifyContent="center" spacing={1} sx={{ py: 4 }}>
          <CircularProgress size={28} sx={{ color: "#fff" }} />
          <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.8)" }}>Rendering report...</Typography>
        </Stack>
      )}
      {error && (
        <Typography variant="body2" sx={{ color: "#ffb4a2", textAlign: "center", py: 2 }}>
          {error}
        </Typography>
      )}
      {!loading && error && blobUrl && (
        <Box
          component="iframe"
          src={`${blobUrl}#view=FitH`}
          title="PDF preview fallback"
          sx={{
            width: "100%",
            minHeight: 640,
            border: "none",
            borderRadius: 2,
            bgcolor: "#fff",
          }}
        />
      )}
      <Box ref={pagesRef} />
    </Box>
  );
}
