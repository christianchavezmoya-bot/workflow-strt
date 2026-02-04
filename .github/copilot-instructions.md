# 915 Underground Network Diagnostic - AI Agent Guidelines

## Project Overview
This is a client-side web application for AI-assisted underground network diagnostics. It processes uploaded files (CSV, TXT, JSON, PDF extracts) to generate diagnostic timelines, risk scoring, and actionable insights for telecom/utility infrastructure.

## Architecture
- **Single-page app**: All functionality in `index.html` with linked `styles.css` and `app.js`
- **No build system**: Direct browser execution, no bundlers or transpilers
- **Local storage**: Session history stored in browser localStorage
- **Canvas rendering**: Signal charts use HTML5 Canvas API

## Key Components
- **Data Intake Panel**: File upload via drag-drop or browse, supports multiple formats
- **AI Diagnostic Engine**: Configurable analysis with layer focus (Conduit/Splice/Optical/Power), urgency levels, geofencing, and feature toggles
- **Results Display**: Summary metrics, AI insights list, recommended actions
- **Session History**: Local storage of analysis results with JSON export/import

## Development Patterns
- **DOM Interaction**: Use specific element IDs for event handlers (e.g., `#startQuickScan`, `#runAnalysis`, `#exportResult`)
- **State Management**: Store analysis results as JSON objects in localStorage under keys like `diagnostic-session-{timestamp}`
- **UI Updates**: Manipulate innerHTML for dynamic content (e.g., `#insightList`, `#actionList`)
- **Progress Indication**: Update `#progressBar` width and `#progressWrap` visibility during analysis
- **File Handling**: Process uploaded files via FileReader API, parse CSV/JSON directly in browser

## Workflow Commands
- **Development**: Open `index.html` directly in browser (no server required)
- **Testing**: Manual UI testing - upload sample files, run diagnostics, verify results display
- **Data Samples**: Create test files with columns like `timestamp`, `node_id`, `signal_strength`, `fault_type` for realistic testing

## Conventions
- **CSS Classes**: Use semantic names like `.panel`, `.result-card`, `.control-grid` for layout
- **Event Handling**: Attach listeners to button IDs for user actions
- **Data Structure**: Analysis results follow pattern: `{ summary: string, confidence: number, riskScore: number, insights: string[], actions: string[] }`
- **Error Handling**: Display user-friendly messages in result panels when operations fail

## Integration Points
- **External Fonts**: Google Fonts (Space Grotesk, JetBrains Mono) loaded via CDN
- **No APIs**: Fully client-side, no server communication required
- **Export Format**: JSON structure matches internal result objects for round-trip compatibility</content>
<parameter name="filePath">c:\Users\cchavez\Documents\Commtrac\Codex\915\.github\copilot-instructions.md