# Time Editor UX Proposal (v3)

## Problem statement

Field testers reported:
1. **Times show UTC** instead of the project site zone (e.g. Australia/Sydney / AEST)
2. **Adjust time feels unprofessional** — tiny segment edges, confusing 2-second long-press, split productive/downtime rows

## Root cause: UTC still showing

The warning *"project timezone not loaded"* appears when `timeZoneId` is `undefined` at render time.

| Cause | Fix in v3 |
|-------|-----------|
| Native IndexedDB project cache predates `timeZoneId` column — stale cache returned immediately | `getProject()` now **blocks for API** when cached project lacks a valid zone |
| `useProjectTimeZone` did not react to background project sync | Listens to `repo:projects:updated` and re-resolves |
| Time editor relied on parent passing zone; parent often had not loaded yet | Dialog accepts `projectId` and resolves zone **internally** via hook |
| Run history used `toLocaleString()` (device zone) | Already fixed in #50; v3 reinforces project-scoped resolution |

After deploy: times should read e.g. **7:44 AM AEST**, not UTC.

---

## Research: Clockify & Jira Tempo patterns

### Clockify (timeline / timesheet)
- **Single horizontal bar** per day — blocks are chronological, color-coded by project/task
- **Boundary handles** sit on the **ruler above** the bar — drag the join between blocks, not the block edge
- **Click block** → side panel with start/end time fields (no hidden gestures)
- **Drag block body** → move entire entry, duration preserved
- **Zoom** on timeline for precision

### Jira Tempo
- Calendar/timeline with **large resize handles** at block boundaries
- **Tap entry** → edit sheet with time pickers
- Clear **visual affordances** (handles, labels) — no long-press

### What we rejected from v2
| v2 pattern | Why it failed |
|------------|----------------|
| Split productive/downtime rows | Same time range rendered on two rows — confusing; segments looked like thin slivers |
| 10px edge handles on segments | Too small for gloved/thumb field use |
| 2-second long-press for edit | Undiscoverable; conflicts with drag |
| Fixed low zoom for short runs | 1-minute blocks were ~5px wide |

---

## v3 design (implemented)

```
  7:30    ◆──────◆──────◆──────◆    9:00   ← draggable time pins (44px touch target)
          │      │      │      │
  ────────┴──────┴──────┴──────┴──────────  ← single chronological track
          [██ productive ██][█ downtime █]
```

### Interactions
| Action | Result |
|--------|--------|
| **Drag pin above bar** | Moves shared boundary — adjusts end of left segment + start of right segment (Clockify-style) |
| **Drag block body** | Moves whole segment; duration unchanged (7–10 → 8–11) |
| **Tap block** | Opens start/end time wheels immediately |
| **Zoom +/-** | Default 150%; up to 1000% for fine edits |
| **+ Add Entry** | Category + duration preset → appends after last segment |

### Future enhancements (not in v3)
- Pinch-to-zoom on mobile
- Snap-to-grid toggle (15 / 30 / 60 min)
- Undo last change
- "Fit workday" preset (07:00–19:00)
- Overlap highlighting on timeline

---

## Test checklist

- [ ] Phone offline with stale project cache → open Adjust time → zone loads after sync (or when online)
- [ ] JO00991 → all labels show **AEST**, not UTC
- [ ] Drag top pin → adjacent segments resize
- [ ] Drag block → moves in time
- [ ] Tap block → edit sheet (no long-press)
- [ ] Add 2h downtime → appears at end of timeline
