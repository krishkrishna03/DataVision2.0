# DataVision — AI-Powered Dashboard Builder

DataVision is a client-side analytics workspace for CSV, Excel and JSON datasets. Its deterministic analysis engine profiles fields, applies role-aware aggregations, and creates editable dashboards with evidence-backed metrics. Data remains in the current browser; the app does not call an LLM or upload dataset rows to a service.

---

## Features

### Data Import
- Upload **CSV**, **Excel (.xlsx, .xls)**, or **JSON** files
- Multi-file union support aligns columns before appending rows
- Automatic field profiling for numeric, categorical, date, currency, rate, geographic, boolean and identifier roles
- 50 MB per-file upload limit; large imports retain a representative sample (up to 5,000 rows) in browser storage
- Sample-based profiling and preparation are clearly identified; they do not represent transformations over unretained rows

### AI Dashboard Generation
- Generates KPIs with explicit formulas and aggregation definitions
- Never sums identifiers or percentage rates; repeated unit prices default to an average
- Creates dataset-aware charts with Top-N category limits:
  - Bar chart (category vs numeric)
  - Line chart (trend over time or by category)
  - Pie/donut chart (share distribution)
  - Area chart (trend visualization)
  - Stacked bar chart (two metrics by category)
  - Scatter plot (correlation between two numerics)
- Includes a **data table** preview with the first 100 rows
- Each chart uses a different color from a curated palette

### Dashboard Management
- **Dashboard Gallery** — view all saved dashboards as cards with chart counts and creation dates
- **Sidebar list** — recent dashboards with inline rename and delete buttons
- Duplicate dashboards and charts; save reusable templates
- Click any dashboard card to open it in the editor
- Delete dashboards with confirmation prompts

### Dashboard Editor
- **Inline title editing** — click the dashboard title to rename it
- **Chart editing** — configure chart type, dimensions, measure, aggregation, sorting and Top-N
- **Add charts** — insert new charts with the "Add" button
- **Remove charts** — click the X icon on any chart
- **Filter panel** — searchable categorical slicers, date ranges, active filter chips, cross-filtering and reset controls
- **Fullscreen mode** — expand the dashboard to fill the entire viewport
- **Export** — download the dashboard as a PNG image or a multi-page PDF report

### Data Explorer & Preparation
- Select any saved dataset and use a searchable, responsive field dictionary to review inferred roles, missing values, distributions, duplicate rows, candidate keys, outliers and domain confidence
- Override field roles, display names and units in an editable data dictionary
- Preview reversible transformations: deduplicate, handle missing values, rename, convert types, filter, split/merge and calculate columns
- Join saved tables on explicit keys and review unmatched keys and row multiplication
- Save transformations as a separate derived dataset; the source remains unchanged

### Analytics & Reporting
- Choose any dataset and one of its dashboards; analytics can use that dashboard's saved filters or all available rows without dashboard filters
- Ask constrained questions (top category, aggregate, record count, latest-vs-prior month) and see formulas/evidence behind local calculations
- Explore correlation, IQR outliers, Pareto contribution, a linear trend estimate with holdout error, and a non-destructive what-if multiplier
- Choose a dataset and a specific dashboard context for exports and report previews; generate formula-escaped CSV/XLSX exports with a 10,000-row cap and PDF/PNG summaries
- Read-only public links are intentionally not offered without server-side identity, permission, expiry and revocation infrastructure

### Template Gallery
- Save any dashboard as a reusable template
- Browse and apply templates to new datasets
- Track template usage counts

### Design
- Unified dark-blue palette plus a light theme toggle
- Glassmorphism effects with backdrop blur
- Animated gradient orbs in the background
- Smooth fade-in and slide-in transitions
- Inter font family with JetBrains Mono for numeric data
- Responsive layout with a fixed sidebar and scrolling content area
- 8px spacing system with consistent border radii

---

## Tech Stack

| Category | Technology |
|---|---|
| Framework | React 19 with Vite 8 |
| Routing | React Router 7 |
| State Management | Zustand 5 (persisted to IndexedDB via idb-keyval) |
| Charts | Recharts 3 |
| Drag-and-Drop Grid | react-grid-layout 2 |
| File Parsing | PapaParse (CSV), xlsx (Excel) |
| File Upload | react-dropzone 15 |
| Icons | lucide-react |
| Export | html2canvas (PNG), jsPDF (PDF) |
| Animations | Framer Motion |
| Date Handling | date-fns |

---

## Project Structure

```
src/
├── App.jsx                          # Route definitions
├── index.css                        # Global styles, design tokens, animations
├── main.jsx                         # Entry point
├── pages/
│   ├── LandingPage.jsx              # Home / welcome screen
│   ├── UploadPage.jsx               # File upload with schema preview
│   ├── DashboardEditor.jsx          # Main dashboard editing canvas
│   ├── DashboardGallery.jsx         # Grid of all saved dashboards
│   ├── DatasetGallery.jsx           # List of uploaded datasets
│   ├── TemplateGallery.jsx          # Browse saved templates
│   ├── ExplorerPage.jsx             # Data dictionary, profiling and preparation
│   ├── AnalyticsPage.jsx            # Local Q&A and advanced analysis
│   └── ReportsPage.jsx              # Filtered exports and report preview
├── components/
│   ├── layout/
│   │   ├── AppShell.jsx             # Sidebar + header + content wrapper
│   │   ├── Sidebar.jsx              # Navigation + dashboard list with rename/delete
│   │   └── Header.jsx               # Page title, search, AI badge, new button
│   ├── charts/
│   │   └── ChartWidget.jsx          # Renders all chart types (bar, line, pie, KPI, etc.)
│   └── dashboard/
│       ├── DashboardGrid.jsx        # react-grid-layout wrapper
│       ├── SlicerPanel.jsx          # Filter dropdowns + date range picker
│       └── ChartEditorModal.jsx     # Inline chart configuration panel
├── store/
│   └── store.js                     # Zustand stores (datasets, dashboards, templates)
└── utils/
    ├── aiSuggester.js               # AI chart generation engine + palettes
    ├── chartDataProcessor.js        # Data filtering, aggregation, date utilities
    ├── dataParser.js                # CSV/Excel/JSON file parsing + schema detection
    ├── dataPreparation.js           # Safe transformations and explicit-key joins
    └── reportGenerator.js           # PDF report generation
```

---

## Getting Started

### Install dependencies

```bash
npm install
```

### Run the dev server

```bash
npm run dev
```

### Build for production

```bash
npm run build
```

### Run unit tests

```bash
npm test
```

### Preview the production build

```bash
npm run preview
```

---

## How It Works

1. **Upload** — Drop a CSV, Excel, or JSON file (up to 50 MB). The parser validates the file and keeps up to 5,000 sampled rows for browser-side analysis.

2. **Profile** — Open Data Explorer to review inferred roles, quality, candidate keys and statistics. Correct roles or units before generating a dashboard.

3. **Generate & explore** — KPI and chart configurations use explicit semantic aggregations. Edit charts, add or duplicate cards, and use filters or chart selections to update the dashboard's shared filter context.

4. **Prepare & analyze** — Apply safe transformations to a derived copy, ask supported questions against the current filters, or inspect descriptive advanced analytics.

5. **Report** — Download filtered CSV/XLSX, print or export a PNG summary, or generate a PDF report for a saved dashboard.

---

## Data Storage

Data is stored locally in the browser using **IndexedDB** (via idb-keyval) through Zustand's persist middleware. Three stores are used:

- **`ai-dashboard-data`** — dataset samples, metadata, role overrides and derived transformation versions
- **`ai-dashboard-boards`** — saved dashboards (charts, layout, filters, titles)
- **`ai-dashboard-templates`** — reusable templates

No data is sent to any server — everything runs client-side. This also means larger-file analysis is sample-based, there is no user/account model, and secure shared links or external LLM-backed chat are not available.

See [LOCAL_DATA_STORAGE.md](./LOCAL_DATA_STORAGE.md) for how browser persistence works and the actual retention limitations. There is no automatic day-based expiry.
