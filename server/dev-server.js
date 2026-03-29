// dev-server.js — Local development server with WebSocket bridge for MCP
// Serves the static public/ folder and provides a WebSocket + HTTP API
// for the MCP server to push model updates to the browser.

import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const publicDir = join(__dirname, '..', 'public');
const designsDir = join(__dirname, '..', 'designs');

const PORT = process.env.PORT || 3000;

// ── Express app ─────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(publicDir));

// In-memory model state (shared between HTTP API and WebSocket)
let currentModel = {
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

// ── HTTP API (MCP server calls these) ───────────────────────────

app.get('/api/model', (req, res) => {
  res.json(currentModel);
});

app.put('/api/model', (req, res) => {
  currentModel = req.body;
  broadcastModel();
  res.json({ ok: true });
});

app.post('/api/model/patch', (req, res) => {
  // Apply a partial update
  Object.assign(currentModel, req.body);
  broadcastModel();
  res.json({ ok: true });
});

// Save/load designs
app.post('/api/designs/:name', (req, res) => {
  const name = req.params.name.replace(/[^a-zA-Z0-9_-]/g, '');
  const path = join(designsDir, `${name}.json`);
  writeFileSync(path, JSON.stringify(currentModel, null, 2));
  res.json({ ok: true, path });
});

app.get('/api/designs/:name', (req, res) => {
  const name = req.params.name.replace(/[^a-zA-Z0-9_-]/g, '');
  const path = join(designsDir, `${name}.json`);
  if (existsSync(path)) {
    const data = readFileSync(path, 'utf-8');
    res.json(JSON.parse(data));
  } else {
    res.status(404).json({ error: 'Design not found' });
  }
});

// ── HTTP + WebSocket server ─────────────────────────────────────

const server = createServer(app);
const wss = new WebSocketServer({ server });

const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  // Send current model on connect
  ws.send(JSON.stringify({ type: 'model-update', model: currentModel }));

  ws.on('close', () => {
    clients.delete(ws);
  });

  ws.on('error', () => {
    clients.delete(ws);
  });
});

function broadcastModel() {
  const msg = JSON.stringify({ type: 'model-update', model: currentModel });
  for (const client of clients) {
    if (client.readyState === 1) { // OPEN
      client.send(msg);
    }
  }
}

function broadcastCenter() {
  const msg = JSON.stringify({ type: 'center' });
  for (const client of clients) {
    if (client.readyState === 1) {
      client.send(msg);
    }
  }
}

// Export for MCP server to use directly
export { currentModel, broadcastModel, broadcastCenter };

// ── Start ───────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`\n  Architect Dev Server`);
  console.log(`  ────────────────────────────`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  WebSocket: ws://localhost:${PORT}`);
  console.log(`  API:     http://localhost:${PORT}/api/model`);
  console.log(`\n  Open in browser to see the floorplan designer.`);
  console.log(`  MCP server can push updates via the HTTP API.\n`);
});
