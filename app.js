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
  m.name = 'Eight Rooms';

  const r1 = createRoom(m, { x: 4, y: 12, width: 4, depth: 4 });
  const r2 = createRoom(m, { x: 0, y: 8,  width: 4, depth: 4 });
  const r3 = createRoom(m, { x: 4, y: 8,  width: 4, depth: 4 });
  const r4 = createRoom(m, { x: 8, y: 8,  width: 4, depth: 4 });
  const r5 = createRoom(m, { x: 0, y: 4,  width: 4, depth: 4 });
  const r6 = createRoom(m, { x: 4, y: 4,  width: 4, depth: 4 });
  const r7 = createRoom(m, { x: 8, y: 4,  width: 4, depth: 4 });
  const r8 = createRoom(m, { x: 4, y: 0,  width: 4, depth: 4 });

  addOpening(m, { wallId: r1.walls[0].id, type: 'door', position: 1.0, width: 0.9, height: 2.1 });
  addOpening(m, { wallId: r2.walls[1].id, type: 'door', position: 2.8, width: 0.9, height: 2.1 });
  addOpening(m, { wallId: r5.walls[2].id, type: 'door', position: 2.5, width: 0.9, height: 2.1 });
  addOpening(m, { wallId: r3.walls[1].id, type: 'door', position: 1.2, width: 0.9, height: 2.1 });
  addOpening(m, { wallId: r3.walls[0].id, type: 'door', position: 3.2, width: 0.9, height: 2.1 });
  addOpening(m, { wallId: r4.walls[0].id, type: 'door', position: 1.5, width: 0.9, height: 2.1 });
  addOpening(m, { wallId: r5.walls[1].id, type: 'door', position: 3.0, width: 0.9, height: 2.1 });
  addOpening(m, { wallId: r7.walls[3].id, type: 'door', position: 1.8, width: 0.9, height: 2.1 });
  addOpening(m, { wallId: r8.walls[2].id, type: 'door', position: 1.5, width: 0.9, height: 2.1 });

  addOpening(m, { wallId: r8.walls[0].id, type: 'door', position: 2.0, width: 1.0, height: 2.1 });

  addOpening(m, { wallId: r1.walls[2].id, type: 'window', position: 2.0, width: 1.8, height: 1.4, sillHeight: 0.8 });
  addOpening(m, { wallId: r1.walls[1].id, type: 'window', position: 2.0, width: 1.2, height: 1.2, sillHeight: 0.9 });
  addOpening(m, { wallId: r1.walls[3].id, type: 'window', position: 2.0, width: 1.2, height: 1.2, sillHeight: 0.9 });

  addOpening(m, { wallId: r2.walls[3].id, type: 'window', position: 2.0, width: 1.5, height: 1.2, sillHeight: 0.9 });
  addOpening(m, { wallId: r2.walls[2].id, type: 'window', position: 2.0, width: 1.2, height: 1.2, sillHeight: 0.9 });

  addOpening(m, { wallId: r4.walls[1].id, type: 'window', position: 2.0, width: 1.5, height: 1.2, sillHeight: 0.9 });
  addOpening(m, { wallId: r4.walls[2].id, type: 'window', position: 2.0, width: 1.2, height: 1.2, sillHeight: 0.9 });

  addOpening(m, { wallId: r5.walls[3].id, type: 'window', position: 2.0, width: 1.5, height: 1.2, sillHeight: 0.9 });
  addOpening(m, { wallId: r5.walls[0].id, type: 'window', position: 2.0, width: 1.2, height: 1.2, sillHeight: 0.9 });

  addOpening(m, { wallId: r7.walls[1].id, type: 'window', position: 2.0, width: 1.5, height: 1.2, sillHeight: 0.9 });
  addOpening(m, { wallId: r7.walls[0].id, type: 'window', position: 2.0, width: 1.2, height: 1.2, sillHeight: 0.9 });

  addOpening(m, { wallId: r8.walls[1].id, type: 'window', position: 2.0, width: 1.0, height: 1.2, sillHeight: 0.9 });
  addOpening(m, { wallId: r8.walls[3].id, type: 'window', position: 2.0, width: 1.0, height: 1.2, sillHeight: 0.9 });

  return m;
}

async function loadFromQuery() {
  const name = new URLSearchParams(window.location.search).get('load');
  if (!name) return null;
  try {
    const res = await fetch(`designs/${encodeURIComponent(name)}.json`);
    if (!res.ok) return null;
    return deserialize(await res.text());
  } catch { return null; }
}

let model = fromUrlHash(window.location.hash) || await loadFromQuery() || createDemoModel();

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

document.getElementById('btn-demo').addEventListener('click', () => {
  clearModel(model);
  const living = createRoom(model, { x: 0, y: 0, width: 6, depth: 4 });
  addOpening(model, { wallId: living.walls[0].id, type: 'door', position: 3, width: 0.9, height: 2.1 });
  addOpening(model, { wallId: living.walls[1].id, type: 'window', position: 2, width: 1.5, height: 1.2, sillHeight: 0.9 });
  addOpening(model, { wallId: living.walls[2].id, type: 'window', position: 3, width: 2.0, height: 1.4, sillHeight: 0.8 });
  const kitchen = createRoom(model, { x: 6, y: 0, width: 4, depth: 4 });
  addOpening(model, { wallId: kitchen.walls[1].id, type: 'window', position: 2, width: 1.2, height: 1.2, sillHeight: 0.9 });
  addOpening(model, { wallId: kitchen.walls[3].id, type: 'door', position: 2, width: 0.9, height: 2.1 });
  model.name = 'Sample House';
  initViews();
});

let ws = null;
let wsRetryCount = 0;

function connectWS() {
  if (!window.location.hostname.match(/^(localhost|127\.0\.0\.1)$/)) {
    wsIndicator.textContent = 'Static mode';
    wsIndicator.style.color = '#888';
    return;
  }
  const port = window.location.port || '3000';
  try {
    ws = new WebSocket(`ws://${window.location.hostname}:${port}`);
  } catch { return; }
  ws.onopen = () => { wsIndicator.textContent = 'MCP Connected'; wsIndicator.style.color = '#4caf50'; wsRetryCount = 0; };
  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'model-update') { model = msg.model; render(); }
      else if (msg.type === 'center') { r2d.centerOn(model); r3d.centerOn(model); }
    } catch (err) { console.error('WS message error:', err); }
  };
  ws.onclose = () => {
    wsIndicator.textContent = 'Disconnected'; wsIndicator.style.color = '#f44336'; ws = null;
    if (wsRetryCount < 10) { setTimeout(connectWS, Math.min(1000 * Math.pow(1.5, wsRetryCount), 10000)); wsRetryCount++; }
  };
  ws.onerror = () => { ws?.close(); };
}

window.__architect = {
  getModel: () => JSON.parse(JSON.stringify(model)),
  setModel: (newModel) => { model = newModel; render(); },
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

window.addEventListener('resize', () => { r2d.resize(); r3d.resize(); });

window.addEventListener('hashchange', () => {
  const loaded = fromUrlHash(window.location.hash);
  if (loaded) { model = loaded; initViews(); }
});

document.body.addEventListener('dragover', (e) => { e.preventDefault(); });
document.body.addEventListener('drop', (e) => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (file && file.name.endsWith('.json')) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try { model = deserialize(ev.target.result); initViews(); }
      catch (err) { alert('Invalid JSON: ' + err.message); }
    };
    reader.readAsText(file);
  }
});

function boot() {
  try {
    const panel = document.querySelector('.panel');
    const rect = panel ? panel.getBoundingClientRect() : null;
    if (!rect || rect.height < 10) {
      if (!boot._retries) boot._retries = 0;
      boot._retries++;
      if (boot._retries < 20) { requestAnimationFrame(boot); return; }
    }
    initViews();
    connectWS();
  } catch (err) {
    document.getElementById('status').textContent = 'Error: ' + err.message;
    document.getElementById('status').style.color = '#f44336';
    console.error('Boot error:', err);
  }
}

if (document.readyState === 'complete') { requestAnimationFrame(boot); }
else { window.addEventListener('load', () => requestAnimationFrame(boot)); }
