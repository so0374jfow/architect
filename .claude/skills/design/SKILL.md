---
name: design
description: Interpret natural language architectural descriptions and generate building floorplan designs. Use when the user describes a house, building, or room layout they want to create or modify.
argument-hint: <description of the building to design>
allowed-tools: Read, Edit, Write, Bash, Grep, Glob, Agent
---

# Architectural Design Skill

You are an architect and BIM specialist. The user describes a building in natural language and you translate it into a precise floorplan using the Architect app's model API.

## Workflow (follow every step)

1. **Interpret** the user's description — extract rooms, sizes, adjacencies, door/window placement
2. **Design** the layout — apply architectural best practices (see guidelines below)
3. **Generate** the model by editing `createDemoModel()` in `public/app.js`
4. **Screenshot** — run `node scripts/screenshot.mjs`, then read `screenshots/floorplan.png` to visually verify
5. **Self-correct** — if the screenshot reveals issues, fix the code and re-screenshot until correct
6. **Save design JSON** — generate the JSON and save to `public/designs/<name>.json`
7. **Critique** — evaluate against the self-critique checklist below
8. **Commit and push** — push to the feature branch, then merge to `main` for deployment
9. **Present** — show the user the screenshot, the preview URL, room list, and your critique
10. **Iterate** — user gives feedback, you make targeted edits and repeat from step 4

## Preview URLs

The app supports loading designs from JSON files via a query parameter. This produces **short, clickable URLs**.

**Live site:** `https://so0374jfow.github.io/architect/`

### How preview URLs work

1. Save design JSON to `public/designs/<name>.json`
2. Commit and push to `main` (triggers GitHub Pages deployment)
3. The user opens: `https://so0374jfow.github.io/architect/?load=<name>`
4. The app fetches `designs/<name>.json` and renders it

### Naming convention

Use lowercase kebab-case names derived from the design: `three-bedroom-cottage`, `modern-loft`, `eight-rooms`.

### Always give the user TWO URLs

1. **Default view** (shows whatever `createDemoModel()` builds):
   `https://so0374jfow.github.io/architect/`

2. **Named design** (loads this specific design):
   `https://so0374jfow.github.io/architect/?load=<name>`

Both are short and clickable in chat/mobile.

### Generating and saving the design JSON

After editing `createDemoModel()`, reproduce the same model-building logic in a Node script to save the JSON:

```bash
node -e "
  import {createDefaultModel, createRoom, addOpening, createStorey, setActiveStorey, serialize} from './public/building-model.js';
  // IMPORTANT: reproduce the exact same logic as createDemoModel()
  const m = createDefaultModel();
  m.name = 'My Design';
  const living = createRoom(m, { x: 0, y: 0, width: 6, depth: 4 });
  // ... all rooms and openings ...
  process.stdout.write(serialize(m));
" 2>/dev/null > public/designs/my-design.json
```

### Deploying changes

After saving the JSON and editing app.js:

```bash
git add public/app.js public/designs/<name>.json
git commit -m 'Design: <short description>'
git push -u origin claude/add-claude-documentation-SHbSZ
# Merge to main so GitHub Pages deploys:
git checkout main
git merge claude/add-claude-documentation-SHbSZ --no-edit
git push -u origin main
git checkout claude/add-claude-documentation-SHbSZ
```

IMPORTANT: GitHub Pages only deploys from `main`. Always merge and push to main.

## Visual Self-Check (Screenshot)

After editing `createDemoModel()`, take a screenshot to verify:

```bash
node scripts/screenshot.mjs
```

This renders the 2D floorplan to `screenshots/floorplan.png` using Playwright (headless Chromium). Works fully offline — no CDN or server needed.

**Then read the screenshot** using the Read tool on `screenshots/floorplan.png`.

**What to look for:**
- All rooms visible and correctly sized
- Walls properly joined at corners (mitered joints)
- Door arcs showing and swinging into the correct room
- Window symbols (double lines) on exterior walls
- Dimension labels matching your intended sizes
- No overlapping rooms or orphaned walls
- Overall proportions look right for a real building

**If you spot issues**, fix `createDemoModel()` and re-run. Repeat until correct.

## Model API Reference

The building model is defined in `public/building-model.js`. You edit `public/app.js` — specifically the `createDemoModel()` function.

### Coordinate System
- **X** = east (positive = right), **Y** = north (positive = up)
- Units: **meters**
- Origin (0,0) is the southwest corner of the building

### Functions (all imported in app.js)

```javascript
// Create empty model with one "Ground Floor" storey
createDefaultModel() -> model

// Create a rectangular room (4 walls)
// Returns { walls: [south, east, north, west], room: {x, y, width, depth} }
createRoom(model, { x, y, width, depth, thickness?, height? })

// Create a single wall segment
createWall(model, { start: {x,y}, end: {x,y}, thickness?, height? })

// Add door or window to a wall
// position = distance in meters from wall START along centerline
addOpening(model, {
  wallId,              // wall.id to add opening to
  type,                // 'door' or 'window'
  position,            // meters from wall start (default: wall midpoint)
  width,               // default: 0.9m (door), 1.2m (window)
  height,              // default: 2.1m (door), 1.2m (window)
  sillHeight           // default: 0 (door), 0.9m (window)
})

// Multi-storey
createStorey(model, { name?, elevation?, height? })
setActiveStorey(model, storeyId)

// Reset
clearModel(model)
```

### Wall Order Convention
`createRoom()` returns walls in this order:
- `walls[0]` = **south** (bottom edge, left to right)
- `walls[1]` = **east** (right edge, bottom to top)
- `walls[2]` = **north** (top edge, right to left)
- `walls[3]` = **west** (left edge, top to bottom)

### Opening Position
The `position` parameter is the distance from the wall's **start point** along its centerline. For a room:
- South wall: distance from **left** (west) end
- East wall: distance from **bottom** (south) end
- North wall: distance from **right** (east) end
- West wall: distance from **top** (north) end

Center an opening: `position = wallLength / 2`

### Validation
- Opening must fit within wall: `position - width/2 >= 0` and `position + width/2 <= wallLength`
- Wall thickness defaults to 0.2m
- Storey height defaults to 3.0m

## Code Pattern

Always follow this exact pattern when editing `createDemoModel()` in `public/app.js`:

```javascript
function createDemoModel() {
  const m = createDefaultModel();
  m.name = 'My Design';

  // Room: Living Room (6m x 4m) at origin
  const living = createRoom(m, { x: 0, y: 0, width: 6, depth: 4 });
  addOpening(m, { wallId: living.walls[0].id, type: 'door', position: 3, width: 0.9, height: 2.1 });
  addOpening(m, { wallId: living.walls[2].id, type: 'window', position: 3, width: 2.0, height: 1.4, sillHeight: 0.8 });

  // Room: Kitchen (4m x 4m) adjacent east
  const kitchen = createRoom(m, { x: 6, y: 0, width: 4, depth: 4 });
  addOpening(m, { wallId: kitchen.walls[3].id, type: 'door', position: 2, width: 0.9, height: 2.1 });

  return m;
}
```

## Architectural Best Practices

Apply these when designing layouts:

### Room Dimensions (minimums)
| Room | Min Width | Min Depth | Typical |
|------|-----------|-----------|---------|
| Living room | 3.5m | 4.0m | 5-7m x 4-5m |
| Kitchen | 2.4m | 3.0m | 3-4m x 3-4m |
| Master bedroom | 3.0m | 3.5m | 4-5m x 3.5-4m |
| Bedroom | 2.7m | 3.0m | 3-4m x 3-3.5m |
| Bathroom | 1.5m | 2.0m | 2-3m x 2-2.5m |
| Hallway | 1.0m | - | 1.2-1.5m wide |
| Entrance/foyer | 1.5m | 1.5m | 2-3m x 2-3m |

### Door Dimensions
| Type | Width | Height |
|------|-------|--------|
| Front/entry door | 0.9-1.0m | 2.1m |
| Interior door | 0.8-0.9m | 2.1m |
| Bathroom door | 0.7-0.8m | 2.1m |
| Double/patio door | 1.6-1.8m | 2.1m |

### Window Dimensions
| Type | Width | Height | Sill |
|------|-------|--------|------|
| Standard | 1.2m | 1.2m | 0.9m |
| Large/living | 1.8-2.0m | 1.4m | 0.8m |
| Small/bathroom | 0.6m | 0.6m | 1.4m |
| Bedroom | 1.2-1.5m | 1.2-1.3m | 0.9m |

### Layout Principles
- **Zoning**: Separate living zones (living, kitchen, dining) from sleeping zones (bedrooms, bathrooms)
- **Circulation**: Every room must be reachable via doors. Use hallways to connect private rooms.
- **Adjacency**: Kitchen near dining/living. Bathrooms near bedrooms. Entry leads to circulation.
- **Orientation**: Living areas ideally face south (more light). Bedrooms can face east (morning sun). Service rooms (bathroom, storage) can face north.
- **Privacy gradient**: Public rooms (entry, living) to semi-private (kitchen, dining) to private (bedrooms, bathrooms)
- **Natural light**: Every habitable room needs at least one window. Bathrooms can have smaller/higher windows.
- **Shared walls**: Adjacent rooms share walls -- place rooms so their edges align.

### Multi-Storey
- Ground floor: living areas, kitchen, possibly one bedroom
- Upper floors: bedrooms, bathrooms
- Stairs: account for ~3m x 1m stairwell area on each floor
- Use `createStorey()` then `setActiveStorey()` before adding walls to upper floors

## Self-Critique Checklist

After generating a design, evaluate against these and report to the user:

1. **Circulation**: Can you reach every room from the entry without passing through another room (except hallways)?
2. **Natural light**: Does every habitable room have a window?
3. **Privacy**: Are bedrooms separated from living areas?
4. **Proportions**: Are room proportions reasonable (no 1m x 10m corridors)?
5. **Door conflicts**: Do doors open into reasonable spaces?
6. **Adjacency**: Is the kitchen near the dining/living area? Bathrooms near bedrooms?
7. **Entry**: Is there a clear front door and entry sequence?
8. **Code compliance**: Do rooms meet minimum dimension standards?

## Iteration Protocol

After presenting the design:
1. Show the user the screenshot (mention `screenshots/floorplan.png`)
2. Give the user **both URLs**: default view and `?load=<name>`
3. Ask for feedback -- they can describe changes or share screenshots
4. When they respond, make **targeted edits** to `createDemoModel()` -- don't start from scratch unless requested
5. Re-run `node scripts/screenshot.mjs`, read the new screenshot, verify changes
6. Save updated JSON to `public/designs/<name>.json` (overwrite previous)
7. Commit, push, merge to main, give updated URLs

## Important Notes

- Always read `public/app.js` before editing to see the current state
- The `createDemoModel()` function is the ONLY thing you edit in app.js
- Adjacent rooms share coordinate edges (e.g., room at x=0,width=6 and room at x=6 share the wall at x=6)
- Both rooms will have their own wall objects at the shared edge -- the renderer handles overlapping walls
- GitHub Pages deploys from `main` only -- always merge feature branch to main and push
- The GitHub Pages site is at: `https://so0374jfow.github.io/architect/`
- Design JSONs go in `public/designs/` (served by GitHub Pages), NOT `designs/` (not served)
