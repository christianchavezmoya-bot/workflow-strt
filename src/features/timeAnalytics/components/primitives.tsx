/**
 * Reusable building blocks for the Time Analytics views.
 * Each view composes these instead of inventing its own markup,
 * so the visual language stays consistent.
 */

import { type ReactNode, type CSSProperties } from "react";
import { Box, Stack, Typography } from "@mui/material";

// ============================================================
// Card
// ============================================================

export interface CardProps {
  title?: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  glow?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function Card({ title, sub, action, children, glow, className, style }: CardProps) {
  return (
    <div className={`ta-card ${glow ? "glow" : ""} ${className ?? ""}`} style={style}>
      {(title || action) && (
        <div className="head">
          <div>
            {title && <div className="title">{title}</div>}
            {sub && <div className="sub">{sub}</div>}
          </div>
          {action && <div className="sub">{action}</div>}
        </div>
      )}
      <div className="body">{children}</div>
    </div>
  );
}

// ============================================================
// KPI card
// ============================================================

export interface KpiProps {
  label: string;
  value: ReactNode;
  unit?: ReactNode;
  delta?: { dir: "up" | "down" | "flat"; text: string };
  hint?: string;
  icon?: string;          // emoji / unicode glyph
  tone?: "default" | "good" | "warn" | "bad" | "violet" | "amber";
}

export function Kpi({ label, value, unit, delta, hint, icon, tone = "default" }: KpiProps) {
  const icoClass =
    tone === "good"   ? "ico good" :
    tone === "warn"   ? "ico warn" :
    tone === "bad"    ? "ico bad"  :
    tone === "violet" ? "ico violet" :
    tone === "amber"  ? "ico amber" : "ico";
  return (
    <div className="ta-kpi">
      <div className="head">
        <div className="label">{label}</div>
        {icon && <div className={icoClass}>{icon}</div>}
      </div>
      <div className="value">
        {value}
        {unit != null && <span className="unit">{unit}</span>}
      </div>
      <div className="foot">
        {delta && (
          <span className={`delta ${delta.dir}`}>
            {delta.dir === "up" ? "↑" : delta.dir === "down" ? "↓" : "·"}
            &nbsp;{delta.text}
          </span>
        )}
        {hint && <span>{hint}</span>}
      </div>
    </div>
  );
}

// ============================================================
// Tag / status
// ============================================================

export function Tag({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "good" | "warn" | "bad" | "cool" | "violet";
}) {
  return <span className={`ta-tag ${tone === "default" ? "" : tone}`}>{children}</span>;
}

// ============================================================
// Mini bar (inline progress bar)
// ============================================================

export function MiniBar({
  pct,
  tone = "default",
  width = 120,
}: {
  pct: number;
  tone?: "default" | "good" | "warn" | "bad" | "cool" | "amber";
  width?: number;
}) {
  const cls = tone === "default" ? "" : tone;
  return (
    <div className={`ta-bar ${cls}`} style={{ width }}>
      <span style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

// ============================================================
// Avatar
// ============================================================

export function Avatar({
  initials,
  color,
  size = "sm",
}: {
  initials: string;
  color: string;
  size?: "sm" | "lg";
}) {
  return (
    <span
      className={`ta-avatar ${size === "lg" ? "lg" : ""}`}
      style={{ background: color }}
    >
      {initials}
    </span>
  );
}

// ============================================================
// Activity feed
// ============================================================

export interface ActivityItem {
  type: "good" | "warn" | "bad";
  text: string;        // may contain <b>
  timestamp: string;   // ISO
}

export function ActivityFeed({ items, max }: { items: ActivityItem[]; max?: number }) {
  const list = max ? items.slice(0, max) : items;
  if (!list.length) return <div className="ta-loading">No recent activity</div>;
  return (
    <div className="ta-feed">
      {list.map((it, i) => (
        <div className="ta-feed-item" key={i}>
          <div className={`ico ${it.type}`}>{it.type === "good" ? "✓" : it.type === "warn" ? "!" : "×"}</div>
          <div className="text" dangerouslySetInnerHTML={{ __html: it.text }} />
          <div className="time">{formatRelative(it.timestamp)}</div>
        </div>
      ))}
    </div>
  );
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (!isFinite(t)) return "—";
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// ============================================================
// Section header
// ============================================================

export function SectionHeader({ title, right }: { title: ReactNode; right?: ReactNode }) {
  return (
    <div className="ta-section-h">
      <h3>{title}</h3>
      {right}
    </div>
  );
}

// ============================================================
// Loading & error
// ============================================================

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="ta-loading">
      <div className="ta-skel" style={{ width: 60, height: 60, borderRadius: "50%" }} />
      <div>{label}</div>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="ta-error">
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
        <Typography variant="body2">{message}</Typography>
        {onRetry && (
          <Box
            onClick={onRetry}
            sx={{ cursor: "pointer", fontSize: 12, fontWeight: 600, textDecoration: "underline" }}
          >
            Retry
          </Box>
        )}
      </Stack>
    </div>
  );
}

// ============================================================
// Chart container (canvas wrapper with consistent height)
// ============================================================

export function ChartBox({
  height = "md",
  children,
}: {
  height?: "sm" | "md" | "lg" | "xl";
  children: ReactNode;
}) {
  return <div className={`ta-chart-box ${height}`}>{children}</div>;
}
