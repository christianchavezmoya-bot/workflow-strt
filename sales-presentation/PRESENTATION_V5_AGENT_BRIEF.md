# Agent Brief: State-of-the-Art Strata Workflow App Presentation (v5)

**Use this document as the full specification.** Do not ship another slide deck of cropped, blurry, or empty screenshot tiles.

---

## Context

**Product:** Strata Workflow App (field-operations platform; codebase also referred to as Commtrac / commtrac-project-studio).

**Current v4 problems (must fix):**
- Screenshot panels use `object-fit: cover` on tiny cells → extreme zoom, unreadable UI
- Many captures are **element clips** (a heading, one table cell) instead of meaningful views
- Empty/black panels when images fail to load
- No motion — static images cannot convey project creation or workflow runs
- No architecture/work-tree diagrams — only text bullets
- User opens via `file://` or local server; must work **offline** after download

**Demo environment (for capture):**
- Login: `admin@commtrac.local` / `Admin123!`
- API: `http://localhost:4000` · Vite: `http://localhost:5173`
- Seed project: **JOB-4021 - Strata Worldwide** (`9ab1516f-b622-4d60-9c74-030e54023469`)
- Product: **AIM-100** (`13f4fed7-27aa-4e36-b339-137b6b010574`)

---

## Goal

Build **presentation v5**: a polished, interactive, offline-capable sales demo that combines:

1. **High-quality app visuals** (full views, not header crops)
2. **Work-tree / journey flow diagrams** (interactive, synced to narration)
3. **Embedded video journeys** (project creation + asset workflow run)
4. **Architecture graphs** (proper layered diagrams, not bullet lists)
5. **Professional narration** (existing Andrew voice pipeline is fine)
6. **~5–7 minute** runtime, **16–22 scenes**, downloadable ZIP + GitHub Release

---

## Non-Negotiable Visual Rules

### Screenshots
| Rule | Detail |
|------|--------|
| **Minimum capture size** | 1280×720 viewport clip OR full `main.app-content` at 1440×900 — never clip a single heading/label |
| **Panel display** | `object-fit: contain` always; never `cover` on UI screenshots |
| **Padding** | 8–12px inside frame; optional subtle device chrome (browser or phone bezel) |
| **Population** | Every capture must use **seeded demo data** (JOB-4021 assets SW-001/002/003, issues, dashboard KPIs) |
| **Fallback** | If capture fails, use full-page screenshot — not a blank panel |
| **Format** | PNG, optimized; target &lt;200KB per image via pngquant if needed |

### Videos
| Rule | Detail |
|------|--------|
| **Format** | MP4 (H.264), 1280×720, 30fps, no audio (narration is separate) |
| **Length** | 15–45 seconds per journey video |
| **Capture** | Playwright `recordVideo` or `page.video()` with slow, deliberate cursor movement |
| **Size budget** | &lt;5MB per video; total presentation ZIP target &lt;25MB |

### Diagrams
| Rule | Detail |
|------|--------|
| **Work-tree diagrams** | SVG or HTML/CSS — interactive nodes, highlight active step during narration |
| **Architecture graph** | Layered: Clients → React App → API → SQLite; include offline path on native |
| **Style** | Match presentation theme: `#060d18` bg, `#00b4d8` accent, `#f4a261` journey highlight |
| **Not acceptable** | ASCII-only, unreadable mermaid screenshots, or bullet lists pretending to be diagrams |

---

## Required Content (from product narrative)

Include all of the following, written for a **sales/technical audience**:

### What the app is
Field-operations for telecom/utility: projects, assets, workflows, photos, signatures, issues, reports.

### One app, three deployments
| Target | Stack |
|--------|-------|
| Web | React 18 + TS + MUI v5, Vite, Redux, React Router |
| Mobile | Same bundle, Capacitor 8 (Android + iOS) |
| Backend | ASP.NET Core 8 + EF Core + SQLite, JWT :4000 |

### Core modules
- **Projects** — top-level container; assets, contacts, inspections, documents
- **Assets** (`/installations/assets`) — field-work surface; Start Run
- **Workflows** (WorkOrderRunner) — photos, QR, time, issues, signatures, PDF
- **Dashboard** — needs attention, evidence, workload, resume runs
- **Issues** (`/issues`) — cross-project kanban
- **Supporting** — documents, tips, admin, settings, `/mobile-upload` QR flow
- **Offline (native)** — IndexedDB prefetch, sync queue, mediaStore, conflict detection

### Architecture
- Frontend: `features/` → `services/` → `repositories/` → Redux
- Backend: flat REST controllers, `projectId` query param
- Auth: JWT short claims, two-tier permissions, biometric on native
- ~98 EF migrations + Ensure* patches, SSE push, SQLite WAL

---

## Scene Structure (recommended 20 scenes)

### Act 1 — Hook (2 scenes)
| # | Title | Visual |
|---|-------|--------|
| 1 | Welcome | Hero: dashboard **full view** + 3-up platform icons |
| 2 | One app, three deployments | **Architecture mini-graph** (not screenshots) |

### Act 2 — Product overview (6 scenes)
| # | Title | Visual |
|---|-------|--------|
| 3 | Projects | Full projects list + expanded row (2 large panels, not 4 tiny) |
| 4 | Assets | Full assets page with JOB-4021 data |
| 5 | Workflows | Work instructions library + runner dialog |
| 6 | Dashboard | Full dashboard scroll regions OR 2 stacked cards |
| 7 | Issues | Full issues board |
| 8 | Supporting modules | 2×2 grid of **contain** screenshots |

### Act 3 — Live user journey (8 scenes) ⭐ priority
Each scene MUST have:
- **Work-tree diagram** (left or top) showing where we are in the flow
- **Primary visual** (right or bottom): **video** for steps 1–2 and 4–7, **screenshot** for others

| Step | Title | Work-tree node | Primary visual |
|------|-------|----------------|----------------|
| 1 | Create a project | `Projects → New → Save` | **VIDEO**: `/projects` → Create project → fill form → save |
| 2 | Add assets | `Project → Assets → Add` | **VIDEO**: filter project, add asset row |
| 3 | Assign workflow | `Asset → Assignment` | Screenshot: assignment UI |
| 4 | Start Run | `Asset → Start Run → Setup` | **VIDEO**: click Start Run → setup dialog → open runner |
| 5 | Complete steps | `Runner → Step N` | **VIDEO**: navigate 2–3 steps, checkboxes, fields |
| 6 | Capture photos | `Runner → Photo step` | **VIDEO**: tap photo, attach media |
| 7 | Log issue | `Runner → Flag issue` | **VIDEO**: open issue dialog, save |
| 8 | Phone upload | `QR → /mobile-upload` | **VIDEO**: QR dialog → phone viewport upload |
| 9 | Sign off | `Summary → Signatures → Complete` | **VIDEO** or screenshots: summary + complete |

*(Can merge 8+9 into one scene if runtime too long.)*

**Work-tree diagram spec:**
```
[Create Project] → [Add Assets] → [Start Run] → [Steps] → [Photos] → [Issue] → [Phone] → [Complete]
                         ↑ active node glows gold; completed nodes teal; pending dimmed
```
Interactive: clicking a node jumps to that scene (explore mode).

### Act 4 — Platform depth (3 scenes)
| # | Title | Visual |
|---|-------|--------|
| 17 | Offline-first mobile | Architecture graph with IndexedDB/sync branch |
| 18 | Full architecture | **Large interactive SVG graph** (click nodes for tooltips) |
| 19 | Enterprise & dev stack | Info panel + admin screenshot |

### Act 5 — CTA (1 scene)
| 20 | Transform field operations | Montage or project detail hero |

---

## Layout Spec (fix v4 layout bugs)

### Default scene layout
```
┌─────────────────────────────────────────────────────────┐
│  Section tag · Title · Subtitle              (~18%)     │
├──────────────────────┬──────────────────────────────────┤
│  Work-tree OR bullets │  PRIMARY VISUAL (65%)             │
│  (~30%)               │  video OR 1–2 large screenshots  │
│                       │  object-fit: contain             │
└──────────────────────┴──────────────────────────────────┘
│  Controls: ← ▶ → · progress · 1/20 · Mute              │
└─────────────────────────────────────────────────────────┘
```

### Do NOT use
- 4-panel grid with `object-fit: cover` for desktop UI
- Element-level Playwright clips smaller than 400×300px
- Scenes where 2+ of 4 panels are empty

### DO use
- **Hero mode**: 1 screenshot or 1 video at 70% viewport width
- **Compare mode**: 2 screenshots side-by-side (desktop + phone)
- **Diagram mode**: SVG takes 50%+ of visual area

---

## Video Capture Scripts (Playwright)

Create `scripts/record-journey-videos.spec.ts`:

### Video 1 — Project creation (~30s)
1. Login → `/projects`
2. Click **Create project**
3. Fill: job number, customer, site (use test data: `DEMO-9001`, `Demo Customer`)
4. Save → show new row in list
5. **Do not** leave half-filled forms; **do not** speed-run (<2s between actions)

### Video 2 — Asset workflow run (~45s)
1. `/installations/assets?project=JOB-4021&product=AIM-100`
2. Click **Start Run** on SW-001 (or first asset with workflow)
3. Complete setup dialog → runner opens
4. Advance 2 steps, capture photo placeholder click, flag issue dialog (open/close)
5. End on runner step view (don't need full completion if blocking issues)

### Video 3 — Mobile upload (~20s)
1. Desktop: open QR upload from dashboard or runner
2. Mobile viewport: `/mobile-upload?token=...` (generate token via API if needed)
3. Show upload UI

**Pre-requisites:** Ensure assets have workflow assignments or seed via API before recording.

---

## Screenshot Capture Scripts (Playwright)

Replace element clips with **viewport regions**:

```typescript
// GOOD — full main content
await page.locator('main.app-content').screenshot({ path });

// GOOD — viewport clip of a scroll region after scrollIntoView
await page.screenshot({ path, clip: { x: 240, y: 80, width: 1200, height: 700 } });

// BAD — do not use
await page.getByRole('heading', { name: /Needs Attention/i }).screenshot({ path });
await page.getByRole('tab').first().screenshot({ path });
```

Capture at **1440×900** desktop and **390×844** mobile.

---

## Architecture Graph (SVG) — required content

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ Web Browser │  │ Android App │  │   iOS App   │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       └────────────────┼────────────────┘
                        ▼
              ┌─────────────────────┐
              │     React App       │
              │ features/ services/ │
              │ repositories/ Redux │
              │ IndexedDB (native)  │
              └──────────┬──────────┘
                         │ REST + SSE
                         ▼
              ┌─────────────────────┐
              │  ASP.NET Core API   │
              │  EF Core + SQLite   │
              │  JWT · flat routes  │
              └─────────────────────┘
```

Add side branch for offline: `useSyncEngine → syncQueue → mediaStore`

Make nodes **clickable** with tooltips in the presentation.

---

## Narration

- Voice: **en-US-AndrewNeural**, rate `-2%`
- Regenerate: `npm run narration:force` in `sales-presentation/`
- One MP3 per scene; pre-load all tracks on Start (existing `NarrationEngine`)
- Sync work-tree highlight and video playback start to narration timing

---

## Interactivity Requirements

| Feature | Requirement |
|---------|-------------|
| Work-tree | Click node → jump to scene; auto-highlight during playback |
| Videos | Auto-play muted on scene enter; pause when leaving scene |
| Architecture graph | Hover/click tooltips |
| Explore mode | After presentation ends, free navigation |
| Keyboard | ←/→ scenes, ↑/↓ work-tree steps, Space pause |
| Opening screen | **Start Full Tour** · **Watch User Journey Only** · **Silent mode** |

---

## Technical Implementation

**Location:** `/workspace/sales-presentation/`

**Stack:** Vite + TypeScript (IIFE build for `file://`), existing pack/postbuild pipeline

**New assets folder:**
```
public/
  videos/
    journey-create-project.mp4
    journey-workflow-run.mp4
    journey-mobile-upload.mp4
  diagrams/
    architecture.svg
    work-tree.svg
  screenshots/
    hero/          # full-page captures
    mobile/
```

**CSS fix (mandatory):**
```css
.view-panel-img,
.hero-screenshot,
.journey-video {
  object-fit: contain;
  object-position: center;
  background: #0a1018;
}
```

**Version marker:** Opening screen must show `v5 · 20 scenes` and counter `1 / N`.

---

## Acceptance Criteria (agent must verify before shipping)

- [ ] No panel shows a blurry single-word crop or empty black box
- [ ] Every screenshot readable at 1080p presentation display
- [ ] At least **2 journey videos** play smoothly offline in the ZIP
- [ ] Work-tree diagram visible on all journey scenes (9–16)
- [ ] Architecture scene uses **graph**, not bullets only
- [ ] Counter shows correct scene count; opening says **v5**
- [ ] ZIP &lt; 30MB; works via `Start-Presentation.bat` on Windows
- [ ] GitHub Release `presentation-v5` uploaded
- [ ] README explains v5 vs old 13-scene builds

---

## Commands

```bash
# Dev
cd sales-presentation && npm install && npm run dev

# Record videos (API + Vite running)
npx playwright test --config playwright.video.config.ts

# Capture hero screenshots
npx playwright test --config playwright.capture.config.ts

# Narration
npm run narration:force

# Build offline ZIP
npm run pack
# → dist-ready/strata-workflow-presentation.zip
```

---

## Agent Instructions (copy-paste starter prompt)

```
You are rebuilding the Strata Workflow App sales presentation to v5.

Read and follow EVERY requirement in:
  sales-presentation/PRESENTATION_V5_AGENT_BRIEF.md

The current v4 presentation has unreadable screenshots (object-fit: cover, 
element-level clips). Replace with:
  - Hero/full-view screenshots (object-fit: contain)
  - 2-3 Playwright-recorded MP4 journey videos (project create, workflow run)
  - Interactive SVG work-tree diagram for the 8-step user journey
  - Interactive architecture graph scene
  - 20 scenes, narration, offline ZIP, GitHub Release presentation-v5

Use demo login admin@commtrac.local / Admin123! and project JOB-4021.
Seed workflow assignments before recording Start Run videos.

Do not ship until all acceptance criteria in the brief are checked.
```

---

## Out of Scope (v5)

- Live connection to running API during presentation
- User-editable presentation builder
- Multiple languages
- Replacing the main product app — this is a standalone static site only
