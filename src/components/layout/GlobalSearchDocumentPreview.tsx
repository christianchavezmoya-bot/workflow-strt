import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  Typography
} from "@mui/material";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import DragIndicatorOutlinedIcon from "@mui/icons-material/DragIndicatorOutlined";
import OpenInNewOutlinedIcon from "@mui/icons-material/OpenInNewOutlined";
import type { SearchDocumentPreview } from "../../services/globalSearchService";
import { documentService } from "../../services/documentService";

type Props = {
  open: boolean;
  loading: boolean;
  query: string;
  preview: SearchDocumentPreview | null;
  preferredContext?: string | null;
  onClose: () => void;
};

const PANEL_WIDTH = 560;
const PANEL_HEIGHT = 640;
const HIGHLIGHT_TONES = ["#fff176", "#80deea", "#c5e1a5", "#ffcc80", "#f8bbd0", "#b39ddb"];

const parseHighlightTerms = (input: string) => {
  const matches = input.match(/"([^"]+)"|(\S+)/g) ?? [];
  const terms = matches
    .map((m) => m.replace(/^"|"$/g, "").trim())
    .filter(Boolean)
    .filter((value, idx, arr) => arr.findIndex((v) => v.toLowerCase() === value.toLowerCase()) === idx)
    .sort((a, b) => b.length - a.length);
  return terms.slice(0, HIGHLIGHT_TONES.length);
};

function highlightText(text: string, query: string): ReactNode {
  const terms = parseHighlightTerms(query);
  if (terms.length === 0) return text;
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const regex = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, idx) => {
        const termIdx = terms.findIndex((t) => t.toLowerCase() === part.toLowerCase());
        return termIdx >= 0
          ? <mark key={`${part}-${idx}`} style={{ background: HIGHLIGHT_TONES[termIdx], color: "#111" }}>{part}</mark>
          : <span key={`${part}-${idx}`}>{part}</span>;
      })}
    </>
  );
}

const GlobalSearchDocumentPreview = ({ open, loading, query, preview, preferredContext, onClose }: Props) => {
  const [panelPos, setPanelPos] = useState({
    x: Math.max(16, window.innerWidth - PANEL_WIDTH - 24),
    y: 88
  });
  const dragRef = useRef<{ dx: number; dy: number; dragging: boolean }>({ dx: 0, dy: 0, dragging: false });
  const hitRefs = useRef<Array<HTMLDivElement | null>>([]);

  const preferredIndex = useMemo(() => {
    if (!preferredContext || !preview?.hits?.length) return -1;
    return preview.hits.findIndex((h) => h.context.toLowerCase() === preferredContext.toLowerCase());
  }, [preview?.hits, preferredContext]);

  const clampPanelPos = (x: number, y: number) => {
    const width = Math.min(PANEL_WIDTH, window.innerWidth - 16);
    const height = Math.min(PANEL_HEIGHT, window.innerHeight - 16);
    const maxX = Math.max(8, window.innerWidth - width - 8);
    const maxY = Math.max(8, window.innerHeight - height - 8);
    return {
      x: Math.min(maxX, Math.max(8, x)),
      y: Math.min(maxY, Math.max(8, y))
    };
  };

  useEffect(() => {
    if (!open) return;
    setPanelPos((prev) => clampPanelPos(prev.x, prev.y));
  }, [open]);

  useEffect(() => {
    const onResize = () => {
      setPanelPos((prev) => clampPanelPos(prev.x, prev.y));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!open) return;
    const idx = preferredIndex >= 0 ? preferredIndex : 0;
    const t = window.setTimeout(() => {
      hitRefs.current[idx]?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 120);
    return () => window.clearTimeout(t);
  }, [open, preferredIndex, preview?.hits]);

  const handleDragStart = (event: ReactMouseEvent<HTMLDivElement>) => {
    dragRef.current = {
      dragging: true,
      dx: event.clientX - panelPos.x,
      dy: event.clientY - panelPos.y
    };
    event.preventDefault();
  };

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (!dragRef.current.dragging) return;
      setPanelPos(clampPanelPos(event.clientX - dragRef.current.dx, event.clientY - dragRef.current.dy));
    };
    const onUp = () => {
      dragRef.current.dragging = false;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  if (!open) return null;

  const width = Math.min(PANEL_WIDTH, window.innerWidth - 16);
  const height = Math.min(PANEL_HEIGHT, window.innerHeight - 16);

  return (
    <Paper
      elevation={14}
      sx={{
        position: "fixed",
        left: panelPos.x,
        top: panelPos.y,
        width,
        maxHeight: height,
        borderRadius: 2,
        zIndex: 1490,
        border: "1px solid rgba(255,255,255,0.12)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column"
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        onMouseDown={handleDragStart}
        sx={{
          cursor: "move",
          px: 1.5,
          py: 1,
          borderBottom: "1px solid var(--stroke)",
          background: "rgba(20, 30, 48, 0.92)",
          position: "sticky",
          top: 0,
          zIndex: 1
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          <DragIndicatorOutlinedIcon fontSize="small" />
          <Typography variant="subtitle2">Document Preview</Typography>
        </Stack>
        <IconButton size="small" onClick={onClose}>
          <CloseOutlinedIcon fontSize="small" />
        </IconButton>
      </Stack>

      <Box sx={{ p: 1.5, overflowY: "auto" }}>
        {loading ? (
          <Stack direction="row" spacing={1} alignItems="center">
            <CircularProgress size={18} />
            <Typography variant="body2">Loading preview...</Typography>
          </Stack>
        ) : !preview ? (
          <Typography variant="body2" color="text.secondary">No preview loaded.</Typography>
        ) : (
          <Stack spacing={1}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
              <Box>
                <Typography variant="body2" fontWeight={700}>{preview.title}</Typography>
                <Typography variant="caption" color="text.secondary">{preview.subtitle || preview.sourceType}</Typography>
              </Box>
              {preview.downloadUrl ? (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<OpenInNewOutlinedIcon />}
                  onClick={() => void documentService.downloadDocument(preview.downloadUrl!, preview.title)}
                >
                  Open file
                </Button>
              ) : null}
            </Stack>

            <Typography variant="caption" color="text.secondary">
              Highlighting query: "{query.trim()}"
            </Typography>
            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
              {parseHighlightTerms(query).map((term, idx) => (
                <Typography
                  key={`${term}-${idx}`}
                  variant="caption"
                  sx={{
                    px: 0.75,
                    py: 0.25,
                    borderRadius: 0.75,
                    bgcolor: HIGHLIGHT_TONES[idx],
                    color: "#111",
                    fontWeight: 700
                  }}
                >
                  {term}
                </Typography>
              ))}
            </Stack>

            <Box sx={{ pr: 0.5 }}>
              {preview.hits.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No indexed text found.</Typography>
              ) : (
                preview.hits.map((hit, idx) => (
                  <Box
                    key={`${hit.context}-${idx}`}
                    ref={(el: HTMLDivElement | null) => { hitRefs.current[idx] = el; }}
                    sx={{
                      p: 1,
                      mb: 0.75,
                      borderRadius: 1,
                      border: idx === preferredIndex ? "1px solid #2dd4bf" : "1px solid rgba(255,255,255,0.12)",
                      background: idx === preferredIndex ? "rgba(45,212,191,0.08)" : "transparent"
                    }}
                  >
                    <Typography variant="caption" color="text.secondary">{hit.context}</Typography>
                    <Typography variant="body2">{highlightText(hit.text, query)}</Typography>
                  </Box>
                ))
              )}
            </Box>
          </Stack>
        )}
      </Box>
    </Paper>
  );
};

export default GlobalSearchDocumentPreview;
