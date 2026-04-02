// app.js — Main application: wires model, renderers, UI, and WebSocket

import {
  createDefaultModel, serialize, deserialize,
  fromUrlHash, toUrlHash,
  createWall, deleteWall, addOpening, deleteOpening,
  createRoom, createStorey, setActiveStorey,
  clearModel, listElements,
} from './building-model.js';
import { Renderer2D } from './renderer-2d.js';
import { Renderer3D } from './renderer-3d.js';
import { downloadIFC } from './ifc-exporter.js';
import { downloadIfcFile } from './ifc-builder.js';
import { importIfcFile } from './ifc-reader.js';

// ── Initialize model ────────────────────────────────────────────

function buildUnit(m, ox, mirror) {
  // Single apartment unit: ~6.0m wide x 9.5m deep
  // ox = x offset, mirror = true to flip for right-hand unit
  // Rooms: walls[0]=south, walls[1]=east, walls[2]=north, walls[3]=west

  const uw = 6.0; // unit width
  function mx(localX, w) {
    // mirror x coordinates for right unit
    if (!mirror) return ox + localX;
    return ox + uw - localX - (w || 0);
  }
  // wall indices flip for mirrored unit: east(1) <-> west(3)
  const E = mirror ? 3 : 1;
  const W = mirror ? 1 : 3;

  // ── Lower half: Living room + Kitchen + Entry ──

  // Living Room: 4.0 x 5.0 — south-west of unit
  const living = createRoom(m, { x: mx(0, 4.0), y: 0, width: 4.0, depth: 5.0 });
  // South wall: large window
  addOpening(m, { wallId: living.walls[0].id, type: 'window', position: 2.0, width: 2.4, height: 2.2, sillHeight: 0.4 });
  // West wall (exterior): window
  addOpening(m, { wallId: living.walls[W].id, type: 'window', position: 2.5, width: 1.6, height: 1.4, sillHeight: 0.8 });
  // East wall: door to entry hall
  addOpening(m, { wallId: living.walls[E].id, type: 'door', position: 3.5, width: 0.9, height: 2.1 });

  // Kitchen: 2.0 x 2.8 — south-east of unit
  const kitchen = createRoom(m, { x: mx(4.0, 2.0), y: 0, width: 2.0, depth: 2.8 });
  // South wall: window
  addOpening(m, { wallId: kitchen.walls[0].id, type: 'window', position: 1.0, width: 1.2, height: 1.2, sillHeight: 0.9 });
  // West wall: door to living
  addOpening(m, { wallId: kitchen.walls[W].id, type: 'door', position: 1.4, width: 0.9, height: 2.1 });

  // Entry Hall: 2.0 x 2.2 — between kitchen and upper rooms
  const entry = createRoom(m, { x: mx(4.0, 2.0), y: 2.8, width: 2.0, depth: 2.2 });
  // East wall: entry door (from stairwell)
  addOpening(m, { wallId: entry.walls[E].id, type: 'door', position: 1.1, width: 0.9, height: 2.1 });

  // ── Upper half: Bedrooms + Bathroom ──

  // Bedroom 1 (larger): 3.2 x 4.5 — north-west of unit
  const bed1 = createRoom(m, { x: mx(0, 3.2), y: 5.0, width: 3.2, depth: 4.5 });
  // West wall (exterior): window
  addOpening(m, { wallId: bed1.walls[W].id, type: 'window', position: 2.25, width: 1.4, height: 1.4, sillHeight: 0.8 });
  // North wall: window
  addOpening(m, { wallId: bed1.walls[2].id, type: 'window', position: 1.6, width: 1.6, height: 1.3, sillHeight: 0.9 });
  // East wall: door from corridor
  addOpening(m, { wallId: bed1.walls[E].id, type: 'door', position: 0.8, width: 0.8, height: 2.1 });

  // Bedroom 2 (smaller): 2.8 x 2.6 — north-east of unit
  const bed2 = createRoom(m, { x: mx(3.2, 2.8), y: 6.9, width: 2.8, depth: 2.6 });
  // North wall: window
  addOpening(m, { wallId: bed2.walls[2].id, type: 'window', position: 1.4, width: 1.4, height: 1.3, sillHeight: 0.9 });
  // South wall: door from corridor
  addOpening(m, { wallId: bed2.walls[0].id, type: 'door', position: 0.6, width: 0.8, height: 2.1 });

  // Bathroom: 2.8 x 1.9 — between entry and bedroom 2
  const bath = createRoom(m, { x: mx(3.2, 2.8), y: 5.0, width: 2.8, depth: 1.9 });
  // East wall: small window
  addOpening(m, { wallId: bath.walls[E].id, type: 'window', position: 0.95, width: 0.6, height: 0.6, sillHeight: 1.5 });
  // South wall: door from hallway area
  addOpening(m, { wallId: bath.walls[0].id, type: 'door', position: 0.6, width: 0.7, height: 2.1 });
}

function createDemoModel() {
  const m = createDefaultModel();
  m.name = 'Engadin Duplex';

  // Left unit
  buildUnit(m, 0, false);

  // Right unit (mirrored, offset by 7.4 — leaves 1.4m stairwell gap)
  buildUnit(m, 7.4, true);

  // Central stairwell walls (shared structure between units)
  createWall(m, { start: { x: 6.0, y: 0 }, end: { x: 6.0, y: 9.5 }, thickness: 0.25 });
  createWall(m, { start: { x: 7.4, y: 0 }, end: { x: 7.4, y: 9.5 }, thickness: 0.25 });
  createWall(m, { start: { x: 6.0, y: 0 }, end: { x: 7.4, y: 0 }, thickness: 0.2 });

  return m;
}

let model = fromUrlHash(window.location.hash) || createDemoModel();

// ── Renderers ───────────────────────────────────────────────────

const canvas2d = document.getElementById('canvas-2d');
const container3d = document.getElementById('container-3d');

const r2d = new Renderer2D(canvas2d);
const r3d = new Renderer3D(container3d);

function render() {
  r2d.render(model);
  r3d.rebuild(model);
  updateStatus();
}

function initViews() {
  r2d.resize();
  r3d.resize();
  r2d.centerOn(model);
  r3d.centerOn(model);
  render();
}

// ── UI: Status bar ──────────────────────────────────────────────

const statusEl = document.getElementById('status');
const wsIndicator = document.getElementById('ws-indicator');

function updateStatus() {
  const storey = model.storeys.find(s => s.id === model.activeStorey) || model.storeys[0];
  if (!storey) return;
  const wallCount = storey.walls.length;
  let doorCount = 0, windowCount = 0;
  for (const w of storey.walls) {
    for (const o of w.openings) {
      if (o.type === 'door') doorCount++;
      else windowCount++;
    }
  }
  statusEl.textContent = `${storey.name} | ${wallCount} walls, ${doorCount} doors, ${windowCount} windows`;
}

// ── UI: Buttons ─────────────────────────────────────────────────

document.getElementById('btn-export-ifc').addEventListener('click', async () => {
  try {
    statusEl.textContent = 'Exporting IFC (web-ifc)...';
    await downloadIfcFile(model);
    updateStatus();
  } catch (err) {
    console.warn('web-ifc export failed, falling back to string template:', err);
    downloadIFC(model);
  }
});

document.getElementById('btn-save-json').addEventListener('click', () => {
  const json = serialize(model);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(model.name || 'building').replace(/\s+/g, '_')}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('btn-load-json').addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        model = deserialize(ev.target.result);
        initViews();
      } catch (err) {
        alert('Invalid JSON file: ' + err.message);
      }
    };
    reader.readAsText(file);
  };
  input.click();
});

document.getElementById('btn-load-ifc').addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.ifc';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      statusEl.textContent = 'Importing IFC...';
      const buffer = await file.arrayBuffer();

      // Load IFC geometry into the 3D viewer via web-ifc-three
      r3d.loadIfcFile(buffer).catch(err => {
        console.warn('IFC 3D preview failed:', err);
      });

      // Parse IFC into building model
      model = await importIfcFile(buffer);
      initViews();
      statusEl.textContent = `Imported: ${model.name}`;
    } catch (err) {
      alert('Failed to import IFC: ' + err.message);
      updateStatus();
    }
  };
  input.click();
});

document.getElementById('btn-share').addEventListener('click', () => {
  const hash = toUrlHash(model);
  window.location.hash = hash.slice(1);
  navigator.clipboard.writeText(window.location.href).then(() => {
    const btn = document.getElementById('btn-share');
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = orig, 1500);
  }).catch(() => {
    prompt('Share this URL:', window.location.href);
  });
});

document.getElementById('btn-clear').addEventListener('click', () => {
  if (confirm('Clear the entire design?')) {
    clearModel(model);
    initViews();
  }
});

// ── UI: Demo button (add sample room) ───────────────────────────

document.getElementById('btn-demo').addEventListener('click', () => {
  clearModel(model);

  // Rebuild the Engadin Duplex plan
  buildUnit(model, 0, false);
  buildUnit(model, 7.4, true);
  createWall(model, { start: { x: 6.0, y: 0 }, end: { x: 6.0, y: 9.5 }, thickness: 0.25 });
  createWall(model, { start: { x: 7.4, y: 0 }, end: { x: 7.4, y: 9.5 }, thickness: 0.25 });
  createWall(model, { start: { x: 6.0, y: 0 }, end: { x: 7.4, y: 0 }, thickness: 0.2 });

  model.name = 'Engadin Duplex';
  initViews();
});

// ── WebSocket connection (for MCP live updates) ─────────────────

let ws = null;
let wsRetryCount = 0;

function connectWS() {
  // Only try WebSocket on localhost (dev mode)
  if (!window.location.hostname.match(/^(localhost|127\.0\.0\.1)$/)) {
    wsIndicator.textContent = 'Static mode';
    wsIndicator.style.color = '#888';
    return;
  }

  const port = window.location.port || '3000';
  try {
    ws = new WebSocket(`ws://${window.location.hostname}:${port}`);
  } catch {
    return;
  }

  ws.onopen = () => {
    wsIndicator.textContent = 'MCP Connected';
    wsIndicator.style.color = '#4caf50';
    wsRetryCount = 0;
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'model-update') {
        model = msg.model;
        render();
      } else if (msg.type === 'center') {
        r2d.centerOn(model);
        r3d.centerOn(model);
      }
    } catch (err) {
      console.error('WS message error:', err);
    }
  };

  ws.onclose = () => {
    wsIndicator.textContent = 'Disconnected';
    wsIndicator.style.color = '#f44336';
    ws = null;
    // Retry with backoff
    if (wsRetryCount < 10) {
      setTimeout(connectWS, Math.min(1000 * Math.pow(1.5, wsRetryCount), 10000));
      wsRetryCount++;
    }
  };

  ws.onerror = () => {
    ws?.close();
  };
}

// ── Expose API for MCP server HTTP calls ────────────────────────
// The dev server proxies MCP tool calls to model mutations
// and broadcasts updates via WebSocket

window.__architect = {
  getModel: () => JSON.parse(JSON.stringify(model)),
  setModel: (newModel) => {
    model = newModel;
    render();
  },
  createWall: (opts) => { const w = createWall(model, opts); render(); return w; },
  deleteWall: (id) => { const w = deleteWall(model, id); render(); return w; },
  addOpening: (opts) => { const o = addOpening(model, opts); render(); return o; },
  deleteOpening: (id) => { const o = deleteOpening(model, id); render(); return o; },
  createRoom: (opts) => { const r = createRoom(model, opts); render(); return r; },
  createStorey: (opts) => { const s = createStorey(model, opts); render(); return s; },
  setActiveStorey: (id) => { const s = setActiveStorey(model, id); render(); return s; },
  clearModel: () => { clearModel(model); render(); return model; },
  listElements: () => listElements(model),
  centerView: () => { r2d.centerOn(model); r3d.centerOn(model); },
};

// ── Init ────────────────────────────────────────────────────────

window.addEventListener('resize', () => {
  r2d.resize();
  r3d.resize();
});

// Load from hash on navigation
window.addEventListener('hashchange', () => {
  const loaded = fromUrlHash(window.location.hash);
  if (loaded) {
    model = loaded;
    initViews();
  }
});

// Drag and drop JSON and IFC files
document.body.addEventListener('dragover', (e) => { e.preventDefault(); });
document.body.addEventListener('drop', async (e) => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (!file) return;

  if (file.name.endsWith('.json')) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        model = deserialize(ev.target.result);
        initViews();
      } catch (err) {
        alert('Invalid JSON: ' + err.message);
      }
    };
    reader.readAsText(file);
  } else if (file.name.endsWith('.ifc')) {
    try {
      statusEl.textContent = 'Importing IFC...';
      const buffer = await file.arrayBuffer();
      r3d.loadIfcFile(buffer).catch(err => console.warn('IFC 3D preview failed:', err));
      model = await importIfcFile(buffer);
      initViews();
      statusEl.textContent = `Imported: ${model.name}`;
    } catch (err) {
      alert('Failed to import IFC: ' + err.message);
      updateStatus();
    }
  }
});

// Boot — wait for layout to be ready
function boot() {
  try {
    // Check if panels have actual dimensions yet
    const panel = document.querySelector('.panel');
    const rect = panel ? panel.getBoundingClientRect() : null;
    if (!rect || rect.height < 10) {
      // Layout not ready, retry
      if (!boot._retries) boot._retries = 0;
      boot._retries++;
      if (boot._retries < 20) {
        requestAnimationFrame(boot);
        return;
      }
    }
    initViews();
    connectWS();
  } catch (err) {
    document.getElementById('status').textContent = 'Error: ' + err.message;
    document.getElementById('status').style.color = '#f44336';
    console.error('Boot error:', err);
  }
}

if (document.readyState === 'complete') {
  requestAnimationFrame(boot);
} else {
  window.addEventListener('load', () => requestAnimationFrame(boot));
}
