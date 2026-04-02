#!/usr/bin/env node
// mcp-server.js — MCP server (stdio transport) for Claude to control the Architect tool
// Claude Code discovers this via .mcp.json and can call architectural design tools.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API_BASE = process.env.ARCHITECT_API || 'http://localhost:3000';

// ── Helpers ─────────────────────────────────────────────────────

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API error: ${res.status} ${await res.text()}`);
  return res.json();
}

async function apiPut(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error: ${res.status} ${await res.text()}`);
  return res.json();
}

async function getModel() {
  return apiGet('/api/model');
}

async function saveModel(model) {
  return apiPut('/api/model', model);
}

let _idCounter = Date.now() % 100000;
function uid(prefix = 'el') {
  return `${prefix}-${++_idCounter}-${Date.now().toString(36)}`;
}

function wallLength(wall) {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function getActiveStorey(model) {
  return model.storeys.find(s => s.id === model.activeStorey) || model.storeys[0];
}

// ── MCP Server ──────────────────────────────────────────────────

const server = new McpServer({
  name: 'architect',
  version: '1.0.0',
  description: 'Architectural floorplan design tool. Create walls, doors, windows, and export IFC files.',
});

// ── Tool: get_model ─────────────────────────────────────────────

server.tool(
  'get_model',
  'Get the full building model JSON. Use this to understand current state before making changes.',
  {},
  async () => {
    const model = await getModel();
    return { content: [{ type: 'text', text: JSON.stringify(model, null, 2) }] };
  }
);

// ── Tool: list_elements ─────────────────────────────────────────

server.tool(
  'list_elements',
  'List all walls, doors, and windows in the active storey with their IDs and dimensions.',
  {},
  async () => {
    const model = await getModel();
    const storey = getActiveStorey(model);
    const elements = [];
    for (const wall of storey.walls) {
      const len = wallLength(wall);
      elements.push({
        type: 'wall', id: wall.id,
        length: +len.toFixed(2), thickness: wall.thickness, height: wall.height,
        start: wall.start, end: wall.end, openings: wall.openings.length,
      });
      for (const op of wall.openings) {
        elements.push({
          type: op.type, id: op.id, wallId: wall.id,
          position: op.position, width: op.width, height: op.height, sillHeight: op.sillHeight,
        });
      }
    }
    return { content: [{ type: 'text', text: JSON.stringify(elements, null, 2) }] };
  }
);

// ── Tool: create_wall ───────────────────────────────────────────

server.tool(
  'create_wall',
  'Create a single wall segment. Coordinates are in meters (plan view: x = east, y = north).',
  {
    startX: z.number().describe('Start X coordinate in meters'),
    startY: z.number().describe('Start Y coordinate in meters'),
    endX: z.number().describe('End X coordinate in meters'),
    endY: z.number().describe('End Y coordinate in meters'),
    thickness: z.number().optional().describe('Wall thickness in meters (default 0.2)'),
    height: z.number().optional().describe('Wall height in meters (default: storey height)'),
  },
  async ({ startX, startY, endX, endY, thickness, height }) => {
    const model = await getModel();
    const storey = getActiveStorey(model);
    const wall = {
      id: uid('wall'),
      start: { x: startX, y: startY },
      end: { x: endX, y: endY },
      thickness: thickness ?? 0.2,
      height: height ?? storey.height,
      openings: [],
    };
    storey.walls.push(wall);
    await saveModel(model);
    return { content: [{ type: 'text', text: `Created wall ${wall.id} (${wallLength(wall).toFixed(1)}m)` }] };
  }
);

// ── Tool: create_room ───────────────────────────────────────────

server.tool(
  'create_room',
  'Create a rectangular room (4 walls). Returns wall IDs for adding doors/windows. Walls are labeled south, east, north, west.',
  {
    x: z.number().describe('Room origin X (south-west corner) in meters'),
    y: z.number().describe('Room origin Y (south-west corner) in meters'),
    width: z.number().describe('Room width (east-west) in meters'),
    depth: z.number().describe('Room depth (north-south) in meters'),
    thickness: z.number().optional().describe('Wall thickness (default 0.2m)'),
    height: z.number().optional().describe('Wall height (default: storey height)'),
  },
  async ({ x, y, width, depth, thickness, height }) => {
    const model = await getModel();
    const storey = getActiveStorey(model);
    const t = thickness ?? 0.2;
    const h = height ?? storey.height;

    const walls = [
      { id: uid('wall'), start: { x, y }, end: { x: x + width, y }, thickness: t, height: h, openings: [], label: 'south' },
      { id: uid('wall'), start: { x: x + width, y }, end: { x: x + width, y: y + depth }, thickness: t, height: h, openings: [], label: 'east' },
      { id: uid('wall'), start: { x: x + width, y: y + depth }, end: { x, y: y + depth }, thickness: t, height: h, openings: [], label: 'north' },
      { id: uid('wall'), start: { x, y: y + depth }, end: { x, y }, thickness: t, height: h, openings: [], label: 'west' },
    ];

    const result = walls.map(w => {
      const { label, ...wallData } = w;
      storey.walls.push(wallData);
      return { id: wallData.id, side: label, length: +(wallLength(wallData).toFixed(1)) };
    });

    await saveModel(model);
    return { content: [{ type: 'text', text: `Created room ${width}x${depth}m:\n${JSON.stringify(result, null, 2)}` }] };
  }
);

// ── Tool: delete_wall ───────────────────────────────────────────

server.tool(
  'delete_wall',
  'Delete a wall by its ID.',
  {
    wallId: z.string().describe('The wall ID to delete'),
  },
  async ({ wallId }) => {
    const model = await getModel();
    const storey = getActiveStorey(model);
    const idx = storey.walls.findIndex(w => w.id === wallId);
    if (idx === -1) return { content: [{ type: 'text', text: `Wall ${wallId} not found` }], isError: true };
    storey.walls.splice(idx, 1);
    await saveModel(model);
    return { content: [{ type: 'text', text: `Deleted wall ${wallId}` }] };
  }
);

// ── Tool: add_opening ───────────────────────────────────────────

server.tool(
  'add_opening',
  'Add a door or window opening to an existing wall. Position is distance from wall start to opening center.',
  {
    wallId: z.string().describe('ID of the wall to add the opening to'),
    type: z.enum(['door', 'window']).describe('Type of opening'),
    position: z.number().describe('Distance from wall start to opening center (meters)'),
    width: z.number().optional().describe('Opening width (default: 0.9m for doors, 1.2m for windows)'),
    height: z.number().optional().describe('Opening height (default: 2.1m for doors, 1.2m for windows)'),
    sillHeight: z.number().optional().describe('Height from floor to bottom of opening (default: 0 for doors, 0.9m for windows)'),
  },
  async ({ wallId, type, position, width, height, sillHeight }) => {
    const model = await getModel();
    const storey = getActiveStorey(model);
    const wall = storey.walls.find(w => w.id === wallId);
    if (!wall) return { content: [{ type: 'text', text: `Wall ${wallId} not found` }], isError: true };

    const wLen = wallLength(wall);
    const opening = {
      id: uid(type),
      type,
      position,
      width: width ?? (type === 'window' ? 1.2 : 0.9),
      height: height ?? (type === 'window' ? 1.2 : 2.1),
      sillHeight: sillHeight ?? (type === 'window' ? 0.9 : 0),
    };

    if (opening.position - opening.width / 2 < 0 || opening.position + opening.width / 2 > wLen) {
      return { content: [{ type: 'text', text: `Opening doesn't fit: wall is ${wLen.toFixed(1)}m, opening needs ${opening.width}m centered at ${position}m` }], isError: true };
    }

    wall.openings.push(opening);
    await saveModel(model);
    return { content: [{ type: 'text', text: `Added ${type} ${opening.id} to wall ${wallId} at position ${position}m` }] };
  }
);

// ── Tool: delete_opening ────────────────────────────────────────

server.tool(
  'delete_opening',
  'Delete a door or window opening by its ID.',
  {
    openingId: z.string().describe('The opening ID to delete'),
  },
  async ({ openingId }) => {
    const model = await getModel();
    const storey = getActiveStorey(model);
    for (const wall of storey.walls) {
      const idx = wall.openings.findIndex(o => o.id === openingId);
      if (idx !== -1) {
        wall.openings.splice(idx, 1);
        await saveModel(model);
        return { content: [{ type: 'text', text: `Deleted opening ${openingId}` }] };
      }
    }
    return { content: [{ type: 'text', text: `Opening ${openingId} not found` }], isError: true };
  }
);

// ── Tool: set_building_name ─────────────────────────────────────

server.tool(
  'set_building_name',
  'Set the building/project name.',
  {
    name: z.string().describe('New building name'),
  },
  async ({ name }) => {
    const model = await getModel();
    model.name = name;
    await saveModel(model);
    return { content: [{ type: 'text', text: `Building name set to: ${name}` }] };
  }
);

// ── Tool: create_storey ─────────────────────────────────────────

server.tool(
  'create_storey',
  'Create a new building storey/floor and make it active.',
  {
    name: z.string().optional().describe('Storey name (e.g., "First Floor")'),
    elevation: z.number().optional().describe('Floor elevation in meters'),
    height: z.number().optional().describe('Floor-to-ceiling height in meters (default 3.0)'),
  },
  async ({ name, elevation, height }) => {
    const model = await getModel();
    const id = uid('storey');
    const storey = {
      id,
      name: name || `Floor ${model.storeys.length + 1}`,
      elevation: elevation ?? model.storeys.length * 3,
      height: height ?? 3.0,
      walls: [],
    };
    model.storeys.push(storey);
    model.activeStorey = id;
    await saveModel(model);
    return { content: [{ type: 'text', text: `Created storey "${storey.name}" at elevation ${storey.elevation}m (now active)` }] };
  }
);

// ── Tool: set_active_storey ─────────────────────────────────────

server.tool(
  'set_active_storey',
  'Switch to a different storey for editing.',
  {
    storeyId: z.string().describe('Storey ID to make active'),
  },
  async ({ storeyId }) => {
    const model = await getModel();
    const s = model.storeys.find(s => s.id === storeyId);
    if (!s) return { content: [{ type: 'text', text: `Storey ${storeyId} not found` }], isError: true };
    model.activeStorey = storeyId;
    await saveModel(model);
    return { content: [{ type: 'text', text: `Active storey: ${s.name}` }] };
  }
);

// ── Tool: clear_model ───────────────────────────────────────────

server.tool(
  'clear_model',
  'Clear the entire design and start fresh.',
  {},
  async () => {
    const model = {
      name: 'Untitled Building',
      units: 'meters',
      activeStorey: 'storey-1',
      storeys: [{
        id: 'storey-1',
        name: 'Ground Floor',
        elevation: 0,
        height: 3.0,
        walls: [],
      }],
    };
    await saveModel(model);
    return { content: [{ type: 'text', text: 'Model cleared.' }] };
  }
);

// ── Tool: export_ifc ────────────────────────────────────────────

server.tool(
  'export_ifc',
  'Export the current design as an IFC file. The file is saved to the designs/ directory.',
  {
    filename: z.string().optional().describe('Output filename (without .ifc extension)'),
  },
  async ({ filename }) => {
    const model = await getModel();
    const fname = (filename || model.name || 'building').replace(/[^a-zA-Z0-9_-]/g, '_');

    const { writeFileSync, mkdirSync } = await import('fs');
    const { join, dirname } = await import('path');
    const { fileURLToPath } = await import('url');
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const designsDir = join(__dirname, '..', 'designs');
    mkdirSync(designsDir, { recursive: true });
    const outPath = join(designsDir, `${fname}.ifc`);

    // Try web-ifc first (proper IFC creation), fall back to string templates
    try {
      const { initIfcEngine, exportIfcBuffer } = await import('../public/ifc-builder.js');
      await initIfcEngine();
      const buffer = exportIfcBuffer(model);
      writeFileSync(outPath, buffer);
      return { content: [{ type: 'text', text: `IFC exported (web-ifc) to: designs/${fname}.ifc` }] };
    } catch (err) {
      // Fallback to string-template exporter
      const { exportIFC } = await import('../public/ifc-exporter.js');
      const ifc = exportIFC(model);
      writeFileSync(outPath, ifc);
      return { content: [{ type: 'text', text: `IFC exported (fallback) to: designs/${fname}.ifc` }] };
    }
  }
);

// ── Tool: save_design ───────────────────────────────────────────

server.tool(
  'save_design',
  'Save the current design as a named JSON file in the designs/ directory.',
  {
    name: z.string().describe('Design name (used as filename)'),
  },
  async ({ name }) => {
    const model = await getModel();
    const fname = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const { writeFileSync } = await import('fs');
    const { join, dirname } = await import('path');
    const { fileURLToPath } = await import('url');
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const outPath = join(__dirname, '..', 'designs', `${fname}.json`);
    writeFileSync(outPath, JSON.stringify(model, null, 2));
    return { content: [{ type: 'text', text: `Design saved to: designs/${fname}.json` }] };
  }
);

// ── Start MCP server ────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('MCP server error:', err);
  process.exit(1);
});
