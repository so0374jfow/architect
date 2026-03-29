# CLAUDE.md — Architect

## Project Overview

Architect is a 2D/3D architectural floorplan designer with MCP (Model Context Protocol) integration and IFC export. Users design building floorplans in a browser, visualize them in 3D, and export to IFC4 format for professional BIM tools.

## Tech Stack

- **Frontend**: Vanilla JavaScript (ES6 modules), HTML5 Canvas, Three.js (v0.170.0 from CDN via import maps)
- **Backend**: Node.js, Express, WebSockets
- **AI Integration**: MCP server (stdio transport) for Claude tool use
- **Module system**: ES modules throughout (`"type": "module"` in package.json)
- **No build step** — frontend is served as-is from `public/`

## Project Structure

```
architect/
├── public/                    # Frontend (served directly, no build)
│   ├── index.html             # Entry point, loads Three.js from CDN
│   ├── app.js                 # Main controller, UI event wiring
│   ├── building-model.js      # Shared data model (browser + Node.js)
│   ├── renderer-2d.js         # Canvas 2D architectural plan renderer
│   ├── renderer-3d.js         # Three.js 3D visualization
│   ├── ifc-exporter.js        # IFC-SPF (IFC4) file generator
│   └── style.css              # Dark theme UI
├── server/
│   ├── dev-server.js          # Express server + WebSocket + REST API (port 3000)
│   └── mcp-server.js          # MCP server exposing 13 Claude tools
├── .github/workflows/
│   └── deploy.yml             # GitHub Pages deployment
├── .mcp.json                  # MCP server configuration
└── package.json               # Dependencies: express, ws, @modelcontextprotocol/sdk
```

## Commands

```bash
npm install          # Install dependencies
npm start            # Start dev server at http://localhost:3000
npm run mcp          # Start MCP server (stdio transport)
```

There is no build, lint, or test command. No automated tests exist.

## Development Workflow

1. `npm start` to run the dev server
2. Open http://localhost:3000 — edit files in `public/` or `server/`, reload browser
3. For MCP testing: `npm run mcp` in a separate terminal
4. Models persist as JSON files in `designs/` directory (filesystem, no database)

## Architecture

### Data Model (`building-model.js`)

The building model is a plain JS object shared between browser and server:

- **Building** → has storeys
- **Storey** → has walls, elevation, height
- **Wall** → has start/end coordinates (plan view), thickness, openings
- **Opening** → door or window, positioned along wall centerline

Coordinates: X = east, Y = north (plan view, meters). 3D: X = east, Y = up, Z = north.

IDs are generated with prefix + counter + timestamp (e.g., `wall-12345-1a2b3c`).

### Communication Flow

```
Browser ←WebSocket→ dev-server ←HTTP→ MCP server → Claude
```

The MCP server calls the dev server's REST API (`/api/*`). WebSocket broadcasts model updates to the browser in real time.

### MCP Tools (13 total)

- **Inspect**: `get_model`, `list_elements`
- **Walls**: `create_wall`, `create_room` (4-wall rectangle), `delete_wall`
- **Openings**: `add_opening`, `delete_opening`
- **Storeys**: `create_storey`, `set_active_storey`
- **Bulk**: `clear_model`, `set_building_name`
- **Export**: `export_ifc`, `save_design`

### Renderers

- **2D** (`renderer-2d.js`): Architectural plan style — black filled walls, mitered corner joints, standard door/window symbols, dimension labels, scale bar. Supports pan/zoom and touch.
- **3D** (`renderer-3d.js`): Three.js with OrbitControls, shadows, per-storey floor slabs, wall/opening materials. Auto-centers on model.

### IFC Export (`ifc-exporter.js`)

Generates valid IFC4-SPF files with full project/site/building/storey hierarchy, wall extrusions, opening voids, and door/window elements.

## Code Conventions

- **Naming**: camelCase for variables/functions, PascalCase for classes
- **No frameworks** — vanilla JS, direct DOM manipulation
- **Single global model** mutated by functions, immediate re-render after changes
- **Section dividers**: `// ─────` used to separate logical sections
- **Error handling**: throw on validation failures in model functions; return error objects in MCP tools

## CI/CD

GitHub Actions deploys `public/` to GitHub Pages on push to `main` or the active development branch. No build step needed.
