import { Box, CircularProgress } from "@mui/material";
import { DescriptionOutlined, ImageOutlined, VideocamOutlined } from "@mui/icons-material";
import { useEffect, useRef, useState } from "react";
import { documentService } from "../../services/documentService";

interface Props {
  downloadUrl: string;
  contentType?: string | null;
  width?: number;
  height?: number;
}

function isImage(ct?: string | null) {
  return !!ct && ct.startsWith("image/");
}

function isVideo(ct?: string | null) {
  return !!ct && ct.startsWith("video/");
}

function isPdf(ct?: string | null, url?: string) {
  if (ct === "application/pdf") return true;
  if (url && url.toLowerCase().includes(".pdf")) return true;
  return false;
}

// Render first page of a PDF into a canvas and return a data URL
async function renderPdfThumbnail(blobUrl: string, width: number, height: number): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const pdf = await pdfjsLib.getDocument({ url: blobUrl }).promise;
  const page = await pdf.getPage(1);

  // Scale so the page fits within the desired width
  const viewport = page.getViewport({ scale: 1 });
  const scale = width / viewport.width;
  const scaled = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(scaled.width);
  canvas.height = Math.round(scaled.height);
  await page.render({ canvas, viewport: scaled }).promise;
  return canvas.toDataURL("image/jpeg", 0.85);
}

export default function DocThumbnail({ downloadUrl, contentType, width = 320, height = 160 }: Props) {
  const [src, setSrc]         = useState<string | null>(null);
  const [status, setStatus]   = useState<"loading" | "done" | "error">("loading");
  const mountedRef             = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    setSrc(null);
    setStatus("loading");

    if (isVideo(contentType)) {
      setStatus("error");
      return () => { mountedRef.current = false; };
    }

    (async () => {
      try {
        const blobUrl = await documentService.openDocument(downloadUrl);
        if (!mountedRef.current) return;

        if (isImage(contentType)) {
          setSrc(blobUrl);
          setStatus("done");
        } else if (isPdf(contentType, downloadUrl)) {
          const thumb = await renderPdfThumbnail(blobUrl, width, height);
          if (!mountedRef.current) return;
          setSrc(thumb);
          setStatus("done");
        } else {
          setStatus("error"); // unsupported type — show generic icon
        }
      } catch {
        if (mountedRef.current) setStatus("error");
      }
    })();

    return () => { mountedRef.current = false; };
  }, [downloadUrl, contentType, width, height]);

  return (
    <Box
      sx={{
        width: "100%",
        height,
        borderRadius: "8px 8px 0 0",
        overflow: "hidden",
        bgcolor: "rgba(255,255,255,0.04)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {status === "loading" && <CircularProgress size={24} />}

      {status === "done" && src && (
        <Box
          component="img"
          src={src}
          alt="preview"
          sx={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      )}

      {status === "error" && (
        isImage(contentType)
          ? <ImageOutlined sx={{ fontSize: 40, color: "text.disabled" }} />
          : isVideo(contentType)
            ? <VideocamOutlined sx={{ fontSize: 40, color: "text.disabled" }} />
            : <DescriptionOutlined sx={{ fontSize: 40, color: "text.disabled" }} />
      )}
    </Box>
  );
}
