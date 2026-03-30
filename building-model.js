// building-model.js — Source of truth for the architectural design
// Works both in browser (ES module) and Node.js

let _idCounter = 0;
function uid(prefix = 'el') {
  return `${prefix}-${++_idCounter}-${Date.now().toString(36)}`;
}

export function createDefaultModel() {
  return {
    name: 'Untitled Building',
    units: 'meters',
    activeStorey: 'storey-1',
    storeys: [
      {
        id: 'storey-1',
        name: 'Ground Floor',
        elevation: 0,
        height: 3.0,
        walls: [],
      },
    ],
  };
}

// ── Storey helpers ──────────────────────────────────────────────

function getActiveStorey(model) {
  return model.storeys.find((s) => s.id === model.activeStorey) || model.storeys[0];
}

export function setActiveStorey(model, storeyId) {
  const s = model.storeys.find((s) => s.id === storeyId);
  if (!s) throw new Error(`Storey ${storeyId} not found`);
  model.activeStorey = storeyId;
  return s;
}

export function createStorey(model, { name, elevation, height } = {}) {
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
  return storey;
}

// ── Wall helpers ────────────────────────────────────────────────

export function createWall(model, { start, end, thickness, height } = {}) {
  const storey = getActiveStorey(model);
  const wall = {
    id: uid('wall'),
    start: { x: start?.x ?? 0, y: start?.y ?? 0 },
    end: { x: end?.x ?? 1, y: end?.y ?? 0 },
    thickness: thickness ?? 0.2,
    height: height ?? storey.height,
    openings: [],
  };
  storey.walls.push(wall);
  return wall;
}

export function deleteWall(model, wallId) {
  const storey = getActiveStorey(model);
  const idx = storey.walls.findIndex((w) => w.id === wallId);
  if (idx === -1) throw new Error(`Wall ${wallId} not found`);
  return storey.walls.splice(idx, 1)[0];
}

// ── Opening helpers (doors & windows) ───────────────────────────

function wallLength(wall) {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function addOpening(model, { wallId, type, position, width, height, sillHeight } = {}) {
  const storey = getActiveStorey(model);
  let wall = null;
  for (const w of storey.walls) {
    if (w.id === wallId) { wall = w; break; }
  }
  if (!wall) throw new Error(`Wall ${wallId} not found`);

  const wLen = wallLength(wall);
  const opening = {
    id: uid(type || 'opening'),
    type: type || 'door',
    position: position ?? wLen / 2,
    width: width ?? (type === 'window' ? 1.2 : 0.9),
    height: height ?? (type === 'window' ? 1.2 : 2.1),
    sillHeight: sillHeight ?? (type === 'window' ? 0.9 : 0),
  };

  // Validate it fits
  if (opening.position - opening.width / 2 < 0 || opening.position + opening.width / 2 > wLen) {
    throw new Error(`Opening doesn't fit in wall (wall length: ${wLen.toFixed(2)}m)`);
  }

  wall.openings.push(opening);
  return opening;
}

export function deleteOpening(model, openingId) {
  const storey = getActiveStorey(model);
  for (const wall of storey.walls) {
    const idx = wall.openings.findIndex((o) => o.id === openingId);
    if (idx !== -1) return wall.openings.splice(idx, 1)[0];
  }
  throw new Error(`Opening ${openingId} not found`);
}

// ── Room convenience ────────────────────────────────────────────

export function createRoom(model, { x, y, width, depth, thickness, height } = {}) {
  const ox = x ?? 0;
  const oy = y ?? 0;
  const w = width ?? 4;
  const d = depth ?? 3;
  const t = thickness ?? 0.2;
  const h = height;

  const walls = [
    createWall(model, { start: { x: ox, y: oy }, end: { x: ox + w, y: oy }, thickness: t, height: h }),           // south
    createWall(model, { start: { x: ox + w, y: oy }, end: { x: ox + w, y: oy + d }, thickness: t, height: h }),   // east
    createWall(model, { start: { x: ox + w, y: oy + d }, end: { x: ox, y: oy + d }, thickness: t, height: h }),   // north
    createWall(model, { start: { x: ox, y: oy + d }, end: { x: ox, y: oy }, thickness: t, height: h }),           // west
  ];

  return { walls, room: { x: ox, y: oy, width: w, depth: d } };
}

// ── Bulk clear ──────────────────────────────────────────────────

export function clearModel(model) {
  const fresh = createDefaultModel();
  Object.assign(model, fresh);
  return model;
}

// ── List / query ────────────────────────────────────────────────

export function listElements(model) {
  const storey = getActiveStorey(model);
  const elements = [];
  for (const wall of storey.walls) {
    const len = wallLength(wall);
    elements.push({
      type: 'wall',
      id: wall.id,
      length: +len.toFixed(2),
      thickness: wall.thickness,
      height: wall.height,
      start: wall.start,
      end: wall.end,
      openings: wall.openings.length,
    });
    for (const op of wall.openings) {
      elements.push({
        type: op.type,
        id: op.id,
        wallId: wall.id,
        position: op.position,
        width: op.width,
        height: op.height,
        sillHeight: op.sillHeight,
      });
    }
  }
  return elements;
}

// ── Serialization (for URL sharing) ─────────────────────────────

export function serialize(model) {
  return JSON.stringify(model);
}

export function deserialize(json) {
  const model = JSON.parse(json);
  // Reset id counter to be safe
  _idCounter = Date.now() % 100000;
  return model;
}

export function toUrlHash(model) {
  const json = serialize(model);
  return '#' + btoa(unescape(encodeURIComponent(json)));
}

export function fromUrlHash(hash) {
  if (!hash || hash.length < 2) return null;
  try {
    const json = decodeURIComponent(escape(atob(hash.slice(1))));
    return deserialize(json);
  } catch {
    return null;
  }
}
