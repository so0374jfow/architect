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

// ── Initialize model ────────────────────────────────────────────

function createDemoModel() {
  const m = createDefaultModel();
  m.name = 'Sample House';

  // Living room
  const living = createRoom(m, { x: 0, y: 0, width: 6, depth: 4 });
  addOpening(m, { wallId: living.walls[0].id, type: 'door', position: 1.5, width: 0.9, height: 2.1 });
  addOpening(m, { wallId: living.walls[2].id, type: 'window', position: 3, width: 2.0, height: 1.4, sillHeight: 0.8 });
  addOpening(m, { wallId: living.walls[1].id, type: 'window', position: 2, width: 1.5, height: 1.2, sillHeight: 0.9 });

  // Kitchen (adjacent east)
  const kitchen = createRoom(m, { x: 6, y: 0, width: 4, depth: 4 });
  addOpening(m, { wallId: kitchen.walls[1].id, type: 'window', position: 2, width: 1.2, height: 1.2, sillHeight: 0.9 });
  addOpening(m, { wallId: kitchen.walls[3].id, type: 'door', position: 2, width: 0.9, height: 2.1 });

  // Bedroom (north of living room)
  const bedroom = createRoom(m, { x: 0, y: 4, width: 5, depth: 3.5 });
  addOpening(m, { wallId: bedroom.walls[0].id, type: 'door', position: 2.5, width: 0.8, height: 2.1 });
  addOpening(m, { wallId: bedroom.walls[2].id, type: 'window', position: 2.5, width: 1.8, height: 1.3, sillHeight: 0.9 });
  addOpening(m, { wallId: bedroom.walls[3].id, type: 'window', position: 1.75, width: 1.0, height: 1.2, sillHeight: 0.9 });

  // Bathroom (north of kitchen)
  const bath = createRoom(m, { x: 5, y: 4, width: 3, depth: 2.5 });
  addOpening(m, { wallId: bath.walls[3].id, type: 'door', position: 1.25, width: 0.7, height: 2.1 });
  addOpening(m, { wallId: bath.walls[1].id, type: 'window', position: 1.25, width: 0.6, height: 0.6, sillHeight: 1.4 });

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

document.getElementById('btn-export-ifc').addEventListener('click', () => {
  downloadIFC(model);
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

  // Living room
  const living = createRoom(model, { x: 0, y: 0, width: 6, depth: 4 });
  addOpening(model, { wallId: living.walls[0].id, type: 'door', position: 3, width: 0.9, height: 2.1 });
  addOpening(model, { wallId: living.walls[1].id, type: 'window', position: 2, width: 1.5, height: 1.2, sillHeight: 0.9 });
  addOpening(model, { wallId: living.walls[2].id, type: 'window', position: 3, width: 2.0, height: 1.4, sillHeight: 0.8 });

  // Kitchen (adjacent)
  const kitchen = createRoom(model, { x: 6, y: 0, width: 4, depth: 4 });
  addOpening(model, { wallId: kitchen.walls[1].id, type: 'window', position: 2, width: 1.2, height: 1.2, sillHeight: 0.9 });

  // Internal door between rooms (delete shared wall segment and add door)
  // The east wall of living room and west wall of kitchen overlap — for simplicity add door to kitchen west wall
  addOpening(model, { wallId: kitchen.walls[3].id, type: 'door', position: 2, width: 0.9, height: 2.1 });

  model.name = 'Sample House';
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

// Drag and drop JSON files
document.body.addEventListener('dragover', (e) => { e.preventDefault(); });
document.body.addEventListener('drop', (e) => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (file && file.name.endsWith('.json')) {
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
  }
});

// Boot — wait for layout to be ready
function boot() {
  try {
    initViews();
    connectWS();
    console.log('Architect booted OK, walls:',
      (model.storeys.find(s => s.id === model.activeStorey) || model.storeys[0])?.walls.length);
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
