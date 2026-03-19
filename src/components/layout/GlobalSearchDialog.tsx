import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import {
  Box,
  Chip,
  CircularProgress,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import FolderOpenOutlinedIcon from "@mui/icons-material/FolderOpenOutlined";
import PrecisionManufacturingOutlinedIcon from "@mui/icons-material/PrecisionManufacturingOutlined";
import ConstructionOutlinedIcon from "@mui/icons-material/ConstructionOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import ChecklistOutlinedIcon from "@mui/icons-material/ChecklistOutlined";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import DragIndicatorOutlinedIcon from "@mui/icons-material/DragIndicatorOutlined";
import { useLocation, useNavigate } from "react-router-dom";
import { globalSearchService, type GlobalSearchResult, type SearchDocumentPreview } from "../../services/globalSearchService";
import GlobalSearchDocumentPreview from "./GlobalSearchDocumentPreview";

type Props = {
  open: boolean;
  onClose: () => void;
};

type FilterId =
  | "all"
  | "attachments"
  | "documents"
  | "workflows"
  | "projects"
  | "assets"
  | "installations"
  | "customers"
  | "createdBy";

const TYPE_LABELS: Record<string, string> = {
  project: "Project",
  installation: "Installation",
  asset: "Asset",
  document: "Document",
  customer: "Customer",
  site: "Site",
  workInstruction: "Work Instruction",
  workOrder: "Work Order"
};

const FILTER_LABELS: Record<FilterId, string> = {
  all: "All",
  attachments: "Attachments",
  documents: "Documents",
  workflows: "Workflow",
  projects: "Projects",
  assets: "Assets",
  installations: "Installations",
  customers: "Customers/Sites",
  createdBy: "Created By"
};

const PANEL_WIDTH = 620;
const PANEL_HEIGHT = 640;
const HIGHLIGHT_TONES = ["#fff176", "#80deea", "#c5e1a5", "#ffcc80", "#f8bbd0", "#b39ddb"];
const PAGE_HIGHLIGHT_BASE = "#fff59d";
const PAGE_HIGHLIGHT_ACTIVE = "#ffb74d";

const parseHighlightTerms = (input: string) => {
  const matches = input.match(/"([^"]+)"|(\S+)/g) ?? [];
  const terms = matches
    .map((m) => m.replace(/^"|"$/g, "").trim())
    .filter(Boolean)
    .filter((value, idx, arr) => arr.findIndex((v) => v.toLowerCase() === value.toLowerCase()) === idx)
    .sort((a, b) => b.length - a.length);
  return terms.slice(0, HIGHLIGHT_TONES.length);
};

function iconForType(type: string) {
  switch (type) {
    case "project": return <FolderOpenOutlinedIcon fontSize="small" />;
    case "installation": return <ConstructionOutlinedIcon fontSize="small" />;
    case "asset": return <PrecisionManufacturingOutlinedIcon fontSize="small" />;
    case "document": return <DescriptionOutlinedIcon fontSize="small" />;
    case "customer": return <BusinessOutlinedIcon fontSize="small" />;
    case "site": return <PlaceOutlinedIcon fontSize="small" />;
    case "workInstruction": return <ChecklistOutlinedIcon fontSize="small" />;
    case "workOrder": return <AssignmentOutlinedIcon fontSize="small" />;
    default: return <SearchOutlinedIcon fontSize="small" />;
  }
}

function clearHighlights() {
  const marks = document.querySelectorAll("mark[data-global-search-highlight='1']");
  marks.forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    parent.replaceChild(document.createTextNode(mark.textContent ?? ""), mark);
    parent.normalize();
  });
}

function normalizeForMatch(text: string) {
  return text.replace(/\.\.\./g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

function buildSnippetNeedle(snippet: string) {
  const normalized = normalizeForMatch(snippet);
  if (!normalized) return "";
  const compact = normalized.replace(/[^\p{L}\p{N}\s]/gu, " ");
  const words = compact.split(" ").filter(Boolean);
  if (words.length === 0) return "";
  return words.slice(0, 8).join(" ");
}

function hashString(input: string) {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) - h) + input.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function applyHighlights(term: string, activeSnippet?: string | null, activeKey?: string | null) {
  clearHighlights();
  const terms = parseHighlightTerms(term);
  if (terms.length === 0) return;

  const root = document.querySelector("main.app-content");
  if (!root) return;

  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const regex = new RegExp(`(${escaped.join("|")})`, "gi");
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  const activeNeedle = buildSnippetNeedle(activeSnippet ?? "");
  const activeNeedleNormalized = activeNeedle ? normalizeForMatch(activeNeedle) : "";
  let activeMark: HTMLElement | null = null;

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const parent = node.parentElement;
    if (!parent) continue;
    const tag = parent.tagName.toLowerCase();
    if (["script", "style", "textarea", "input", "mark"].includes(tag)) continue;
    if (!node.nodeValue || !regex.test(node.nodeValue)) continue;
    regex.lastIndex = 0;
    textNodes.push(node);
  }

  for (const node of textNodes) {
    const text = node.nodeValue ?? "";
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    let cursor = 0;
    const frag = document.createDocumentFragment();

    while ((match = regex.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (start > cursor) {
        frag.appendChild(document.createTextNode(text.slice(cursor, start)));
      }
      const mark = document.createElement("mark");
      mark.setAttribute("data-global-search-highlight", "1");
      const matchText = text.slice(start, end);
      const toneIdx = terms.findIndex((t) => t.toLowerCase() === matchText.toLowerCase());
      const tokenTone = HIGHLIGHT_TONES[toneIdx >= 0 ? toneIdx : 0];
      mark.style.background = terms.length > 1 ? tokenTone : PAGE_HIGHLIGHT_BASE;
      mark.style.color = "#111";
      mark.textContent = matchText;
      frag.appendChild(mark);

      if (!activeMark && activeNeedleNormalized) {
        const parentText = normalizeForMatch(node.parentElement?.textContent ?? "");
        if (parentText.includes(activeNeedleNormalized)) {
          activeMark = mark;
        }
      }
      cursor = end;
      if (match[0].length === 0) break;
    }
    if (cursor < text.length) {
      frag.appendChild(document.createTextNode(text.slice(cursor)));
    }
    node.parentNode?.replaceChild(frag, node);
  }

  if (terms.length === 1) {
    const marks = Array.from(document.querySelectorAll("mark[data-global-search-highlight='1']")) as HTMLElement[];
    if (!activeMark && marks.length > 0) {
      const tokens = normalizeForMatch(activeSnippet ?? "")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(" ")
        .filter((w) => w.length >= 3)
        .slice(0, 12);

      if (tokens.length > 0) {
        let bestScore = -1;
        let bestIndex = 0;
        marks.forEach((mark, idx) => {
          const container = normalizeForMatch(mark.parentElement?.textContent ?? "");
          let score = 0;
          for (const t of tokens) {
            if (container.includes(t)) score++;
          }
          if (score > bestScore) {
            bestScore = score;
            bestIndex = idx;
          }
        });
        activeMark = marks[bestIndex];
      } else {
        const idx = (activeKey ? hashString(activeKey) : 0) % marks.length;
        activeMark = marks[idx];
      }
    }

    if (!activeMark) {
      activeMark = marks[0] ?? null;
    }
    if (activeMark) {
      activeMark.style.background = PAGE_HIGHLIGHT_ACTIVE;
      activeMark.style.border = "1px solid #fb8c00";
      activeMark.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }
}

const GlobalSearchDialog = ({ open, onClose }: Props) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [filter, setFilter] = useState<FilterId>("all");
  const [activeIndex, setActiveIndex] = useState(0);
  const [highlightTerm, setHighlightTerm] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<SearchDocumentPreview | null>(null);
  const [previewContext, setPreviewContext] = useState<string | null>(null);
  const [activeResultSnippet, setActiveResultSnippet] = useState<string | null>(null);
  const [activeResultKey, setActiveResultKey] = useState<string | null>(null);
  const [panelPos, setPanelPos] = useState({ x: Math.max(16, Math.floor((window.innerWidth - PANEL_WIDTH) / 2)), y: 88 });
  const dragRef = useRef<{ dx: number; dy: number; dragging: boolean }>({ dx: 0, dy: 0, dragging: false });

  useEffect(() => {
    if (!open) {
      clearHighlights();
      return;
    }
    const t = window.setTimeout(() => applyHighlights(highlightTerm, activeResultSnippet, activeResultKey), 80);
    return () => window.clearTimeout(t);
  }, [open, location.key, highlightTerm, activeResultSnippet, activeResultKey]);

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      setActiveIndex(0);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await globalSearchService.search(trimmed, 80);
        if (!cancelled) {
          setResults(response.results);
          setActiveIndex(0);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Global search failed:", error);
          setResults([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query]);

  const filteredResults = useMemo(() => {
    const q = results;
    if (filter === "all") return q;
    if (filter === "attachments") {
      return q.filter((r) => r.entityType === "document" && r.route.includes("/installations/assets"));
    }
    if (filter === "documents") return q.filter((r) => r.entityType === "document");
    if (filter === "workflows") return q.filter((r) => r.entityType === "workInstruction" || r.entityType === "workOrder");
    if (filter === "projects") return q.filter((r) => r.entityType === "project");
    if (filter === "assets") return q.filter((r) => r.entityType === "asset");
    if (filter === "installations") return q.filter((r) => r.entityType === "installation");
    if (filter === "customers") return q.filter((r) => r.entityType === "customer" || r.entityType === "site");
    return q.filter((r) => r.matchedFields.some((f) => f.toLowerCase().includes("created by")));
  }, [results, filter]);

  const groupedResults = useMemo(() => {
    const grouped = new Map<string, GlobalSearchResult[]>();
    for (const result of filteredResults) {
      const label = TYPE_LABELS[result.entityType] ?? "Other";
      const list = grouped.get(label) ?? [];
      list.push(result);
      grouped.set(label, list);
    }
    return Array.from(grouped.entries());
  }, [filteredResults]);

  const handleNavigate = async (result: GlobalSearchResult) => {
    const term = query.trim();
    if (term) setHighlightTerm(term);
    setActiveResultSnippet(result.snippet ?? null);
    setActiveResultKey(result.id);
    navigate(result.route);

    const isDocumentContentHit =
      result.entityType === "document" &&
      result.matchedFields.some((field) => field.toLowerCase().startsWith("content ("));

    if (!isDocumentContentHit) {
      setPreviewOpen(false);
      setPreviewData(null);
      setPreviewContext(null);
      return;
    }

    const sourceType = result.route.includes("/installations/assets") ? "asset" : "library";
    const contextFromSubtitle = (() => {
      const subtitle = result.subtitle ?? "";
      const idx = subtitle.lastIndexOf(" - ");
      return idx >= 0 ? subtitle.slice(idx + 3).trim() : null;
    })();

    try {
      setPreviewOpen(true);
      setPreviewLoading(true);
      setPreviewContext(contextFromSubtitle);
      const preview = await globalSearchService.getDocumentPreview(result.entityId, sourceType, term || undefined, 240);
      setPreviewData(preview);
    } catch (error) {
      console.error("Document preview failed:", error);
      setPreviewData(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (filteredResults.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % filteredResults.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => (prev - 1 + filteredResults.length) % filteredResults.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      void handleNavigate(filteredResults[activeIndex]);
    }
  };

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
      const width = Math.min(PANEL_WIDTH, window.innerWidth - 16);
      const maxX = Math.max(8, window.innerWidth - width - 8);
      const maxY = Math.max(8, window.innerHeight - 120);
      setPanelPos({
        x: Math.min(maxX, Math.max(8, event.clientX - dragRef.current.dx)),
        y: Math.min(maxY, Math.max(8, event.clientY - dragRef.current.dy))
      });
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

  const closePanel = () => {
    setHighlightTerm("");
    setResults([]);
    setQuery("");
    setActiveIndex(0);
    setPreviewData(null);
    setPreviewOpen(false);
    setActiveResultSnippet(null);
    setActiveResultKey(null);
    clearHighlights();
    onClose();
  };

  if (!open) return null;

  const width = Math.min(PANEL_WIDTH, window.innerWidth - 16);

  return (
    <Paper
      elevation={14}
      onKeyDown={handleDialogKeyDown}
      sx={{
        position: "fixed",
        left: panelPos.x,
        top: panelPos.y,
        width,
        maxHeight: PANEL_HEIGHT,
        borderRadius: 2,
        zIndex: 1500,
        border: "1px solid rgba(255,255,255,0.12)",
        overflow: "hidden"
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
          background: "rgba(18, 23, 31, 0.9)"
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          <DragIndicatorOutlinedIcon fontSize="small" />
          <Typography variant="subtitle2">Global Search</Typography>
        </Stack>
        <IconButton size="small" onClick={closePanel}>
          <CloseOutlinedIcon fontSize="small" />
        </IconButton>
      </Stack>

      <Box sx={{ p: 1.5 }}>
        <Stack spacing={1.25}>
          <TextField
            autoFocus
            fullWidth
            size="small"
            placeholder="Search projects, documents, workflow, assets..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlinedIcon fontSize="small" />
                </InputAdornment>
              ),
              endAdornment: loading ? <CircularProgress size={16} /> : undefined
            }}
          />

          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
            {(Object.keys(FILTER_LABELS) as FilterId[]).map((id) => (
              <Chip
                key={id}
                size="small"
                label={FILTER_LABELS[id]}
                color={filter === id ? "primary" : "default"}
                variant={filter === id ? "filled" : "outlined"}
                onClick={() => {
                  setFilter(id);
                  setActiveIndex(0);
                }}
              />
            ))}
          </Stack>

          <Typography variant="caption" color="text.secondary">
            Stays open until you close it. Results keep highlighting your active search term.
          </Typography>
          {highlightTerm.trim() ? (
            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
              {parseHighlightTerms(highlightTerm).map((term, idx) => (
                <Chip
                  key={`${term}-${idx}`}
                  size="small"
                  label={term}
                  sx={{ backgroundColor: HIGHLIGHT_TONES[idx], color: "#111", fontWeight: 600 }}
                />
              ))}
              {parseHighlightTerms(highlightTerm).length === 1 ? (
                <>
                  <Chip size="small" label="Page hits (base)" sx={{ backgroundColor: PAGE_HIGHLIGHT_BASE, color: "#111", fontWeight: 600 }} />
                  <Chip size="small" label="Selected result" sx={{ backgroundColor: PAGE_HIGHLIGHT_ACTIVE, color: "#111", fontWeight: 700 }} />
                </>
              ) : null}
            </Stack>
          ) : null}

          <Box sx={{ maxHeight: 470, overflowY: "auto", pr: 0.5 }}>
            {query.trim().length < 2 ? (
              <Typography variant="body2" color="text.secondary">
                Type at least 2 characters to search.
              </Typography>
            ) : groupedResults.length === 0 && !loading ? (
              <Typography variant="body2" color="text.secondary">
                No matches found.
              </Typography>
            ) : (
              groupedResults.map(([groupLabel, groupItems]) => (
                <Box key={groupLabel} sx={{ mb: 1.25 }}>
                  <Typography variant="overline" color="text.secondary">
                    {groupLabel}
                  </Typography>
                  <List disablePadding>
                    {groupItems.map((item) => {
                      const index = filteredResults.findIndex((r) => r.id === item.id);
                      const selected = index === activeIndex;
                      return (
                        <ListItemButton
                          key={item.id}
                          selected={selected}
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={() => { void handleNavigate(item); }}
                          sx={{ borderRadius: 1, mb: 0.5, alignItems: "flex-start" }}
                        >
                          <Stack direction="row" spacing={1.25} sx={{ width: "100%" }}>
                            <Box sx={{ pt: 0.25, color: "text.secondary" }}>{iconForType(item.entityType)}</Box>
                            <ListItemText
                              primary={
                                <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                                  <Typography variant="body2" fontWeight={600}>{item.title}</Typography>
                                  {item.subtitle ? (
                                    <Typography variant="caption" color="text.secondary">{item.subtitle}</Typography>
                                  ) : null}
                                </Stack>
                              }
                              secondary={
                                <Stack spacing={0.75} sx={{ mt: 0.5 }}>
                                  <Typography variant="caption" color="text.secondary">{item.snippet}</Typography>
                                  <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                                    {item.matchedFields.slice(0, 4).map((field) => (
                                      <Chip key={field} size="small" variant="outlined" label={field} />
                                    ))}
                                  </Stack>
                                </Stack>
                              }
                            />
                          </Stack>
                        </ListItemButton>
                      );
                    })}
                  </List>
                </Box>
              ))
            )}
          </Box>
        </Stack>
      </Box>
      <GlobalSearchDocumentPreview
        open={previewOpen}
        loading={previewLoading}
        query={query}
        preview={previewData}
        preferredContext={previewContext}
        onClose={() => {
          setPreviewOpen(false);
          setPreviewData(null);
        }}
      />
    </Paper>
  );
};

export default GlobalSearchDialog;
