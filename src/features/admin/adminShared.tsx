import { Paper, type PaperProps } from "@mui/material";
import { Dispatch, SetStateAction, useEffect, useState, MouseEvent as ReactMouseEvent } from "react";

/** MUI `sx` prop — matches standard secondary body text. */
export const fieldLabelSx = {
  color: "text.secondary",
  fontWeight: 600,
} as const;

/** Plain HTML `style=` — theme palette keys are invalid here. */
export const fieldLabelInlineStyle: React.CSSProperties = {
  color: "var(--text-2)",
  fontWeight: 600,
};

/** @deprecated Use fieldLabelSx (sx) or fieldLabelInlineStyle (style). */
export const fieldLabelStyle = fieldLabelSx;

export const defaultCustomColumns = ["ID", "Name", "Created Date"];

export const getDefaultColumnType = (name: string) => {
  if (name === "ID") return "lookup field";
  if (name === "Created Date") return "date";
  return "text";
};

export const createDefaultCustomRow = (index: number) => ({
  ID: `ID-${String(index).padStart(3, "0")}`,
  Name: "New item",
  "Created Date": new Date().toISOString().slice(0, 10),
});

export const normalize = (value: string | number | boolean | undefined | null) => String(value ?? "");

export const resolveErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const anyError = error as {
      message?: string;
      response?: {
        data?: string | {
          title?: string;
          detail?: string;
          message?: string;
          errors?: Record<string, string[]>;
        };
      };
    };

    if (anyError.response?.data && typeof anyError.response.data === "object") {
      const data = anyError.response.data;
      if (data.errors && typeof data.errors === "object") {
        const errorMessages = Object.entries(data.errors)
          .map(([field, messages]) => `${field}: ${Array.isArray(messages) ? messages.join(", ") : messages}`)
          .join("; ");
        if (errorMessages) {
          return `${data.title || "Validation error"} - ${errorMessages}`;
        }
      }
      return data.title || data.detail || data.message || fallback;
    }

    if (anyError.response?.data && typeof anyError.response.data === "string") {
      return anyError.response.data;
    }

    return anyError.message || fallback;
  }
  return fallback;
};

export const applyAutoSort = <T,>(
  rows: T[],
  sort: { key: string; dir: "asc" | "desc" },
  accessorMap: Record<string, (row: T) => string>,
) => {
  if (!sort.key || !accessorMap[sort.key]) return rows;
  const accessor = accessorMap[sort.key];
  return [...rows].sort((a, b) => {
    const aVal = accessor(a).toLowerCase();
    const bVal = accessor(b).toLowerCase();
    if (aVal < bVal) return sort.dir === "asc" ? -1 : 1;
    if (aVal > bVal) return sort.dir === "asc" ? 1 : -1;
    return 0;
  });
};

export const applyAutoFilter = <T,>(
  rows: T[],
  filters: Record<string, Set<string>>,
  accessorMap: Record<string, (row: T) => string>,
) => {
  return rows.filter((row) =>
    Object.entries(filters).every(([key, selected]) => {
      if (!selected || selected.size === 0) return true;
      const value = accessorMap[key]?.(row) ?? "";
      return selected.has(value);
    }),
  );
};

export const toggleFilterValue = (
  setter: Dispatch<SetStateAction<Record<string, Set<string>>>>,
  key: string,
  value: string,
) => {
  setter((prev) => {
    const current = new Set(prev[key] ?? []);
    if (current.has(value)) {
      current.delete(value);
    } else {
      current.add(value);
    }
    return { ...prev, [key]: current };
  });
};

export function DraggablePaper(props: PaperProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const handleMouseDown = (e: ReactMouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest(".MuiDialogTitle-root")) {
      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      });
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y,
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, dragStart.x, dragStart.y, position.x, position.y]);

  return (
    <Paper
      {...props}
      onMouseDown={handleMouseDown}
      sx={{
        ...props.sx,
        transform: `translate(${position.x}px, ${position.y}px)`,
        cursor: isDragging ? "grabbing" : "default",
        "& .MuiDialogTitle-root": {
          cursor: "grab",
        },
      }}
    />
  );
}
