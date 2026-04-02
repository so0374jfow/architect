// facade-scatter.js — Spolia-style random object scattering on facade walls
// Ported from aa-page's generate_slots.mjs bitmap packing algorithm
// Generates irregular, organic-looking 3D objects covering exterior walls

import * as THREE from 'three';

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Random dimensions in mm — wide range from tiny shards to large blocks
function randomDims() {
  const w = rand(25, 350);
  const h = rand(25, 300);
  // Depth distribution: 80% shallow, 15% medium protrusion, 5% dramatic
  const r = Math.random();
  const d = r < 0.05 ? rand(400, 800) : r < 0.20 ? rand(200, 500) : rand(20, 300);
  return { width: w, height: h, depth: d };
}

/**
 * Bitmap-based free packing on a wall surface.
 * Phase 1: Random scatter (8000 attempts)
 * Phase 2: Infill scan fills remaining gaps with small pieces
 */
function packWallSurface(wallLenMM, wallHeightMM) {
  const RES = 8; // mm per pixel (coarser than aa-page's 5mm for performance)
  const gridW = Math.ceil(wallLenMM / RES);
  const gridH = Math.ceil(wallHeightMM / RES);

  if (gridW < 2 || gridH < 2) return [];

  const grid = new Uint8Array(gridW * gridH);

  function canPlace(gx, gy, gw, gh) {
    if (gx + gw > gridW || gy + gh > gridH) return false;
    for (let y = gy; y < gy + gh; y++) {
      for (let x = gx; x < gx + gw; x++) {
        if (grid[y * gridW + x]) return false;
      }
    }
    return true;
  }

  function markOccupied(gx, gy, gw, gh) {
    for (let y = gy; y < gy + gh; y++) {
      for (let x = gx; x < gx + gw; x++) {
        grid[y * gridW + x] = 1;
      }
    }
  }

  const slots = [];

  // Phase 1: Random placement — organic scatter
  const attempts = Math.min(8000, gridW * gridH);
  for (let i = 0; i < attempts; i++) {
    const dims = randomDims();
    const gw = Math.max(1, Math.round(dims.width / RES));
    const gh = Math.max(1, Math.round(dims.height / RES));

    const gx = rand(0, Math.max(0, gridW - gw));
    const gy = rand(0, Math.max(0, gridH - gh));

    if (!canPlace(gx, gy, gw, gh)) continue;
    markOccupied(gx, gy, gw, gh);

    slots.push({
      x: gx * RES,
      y: gy * RES,
      width: gw * RES,
      height: gh * RES,
      depth: dims.depth,
    });
  }

  // Phase 2: Infill — scan for gaps and fill with small pieces
  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      if (grid[gy * gridW + gx]) continue;

      // Expand right
      let gw = 0;
      while (gx + gw < gridW && !grid[gy * gridW + gx + gw]) gw++;
      gw = Math.min(gw, Math.ceil(200 / RES));

      // Expand down
      let gh = 0;
      let canExpand = true;
      while (gy + gh < gridH && canExpand) {
        for (let x = gx; x < gx + gw; x++) {
          if (grid[(gy + gh) * gridW + x]) { canExpand = false; break; }
        }
        if (canExpand) gh++;
      }
      gh = Math.min(gh, Math.ceil(200 / RES));

      if (gw < 2 || gh < 2) {
        markOccupied(gx, gy, Math.max(gw, 1), Math.max(gh, 1));
        continue;
      }

      markOccupied(gx, gy, gw, gh);

      const r = Math.random();
      const depth = r < 0.05 ? rand(400, 800) : r < 0.20 ? rand(200, 500) : rand(20, 280);

      slots.push({
        x: gx * RES,
        y: gy * RES,
        width: gw * RES,
        height: gh * RES,
        depth,
      });
    }
  }

  return slots;
}

// Color palette — warm stone / terracotta tones for spolia aesthetic
const PALETTE = [
  0xd4a574, 0xc4956a, 0xb8860b, 0xa0522d, 0xcd853f,
  0xdeb887, 0xd2b48c, 0xbc8f8f, 0xf5deb3, 0xe8d5b7,
  0x8b7355, 0xa67b5b, 0xc9b59a, 0x9c8565, 0xbfa07a,
  0x7a6652, 0x635147, 0x4a3728, 0xc4a882, 0xe0cda9,
];

/**
 * Detect outer facade walls from a building model.
 * Returns walls that form the exterior perimeter (no other wall shares their outer face).
 */
function findFacadeWalls(model) {
  const storey = model.storeys.find(s => s.id === model.activeStorey) || model.storeys[0];
  if (!storey) return [];
  // For this duplex, all walls are potentially facade walls
  // Filter to walls that have at least one endpoint on the bounding box perimeter
  const walls = storey.walls;
  if (walls.length === 0) return [];

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const w of walls) {
    minX = Math.min(minX, w.start.x, w.end.x);
    minY = Math.min(minY, w.start.y, w.end.y);
    maxX = Math.max(maxX, w.start.x, w.end.x);
    maxY = Math.max(maxY, w.start.y, w.end.y);
  }

  const TOL = 0.05;
  return walls.filter(w => {
    // Wall is on facade if it runs along the perimeter bounding box
    const sx = w.start.x, sy = w.start.y, ex = w.end.x, ey = w.end.y;
    const onMinX = Math.abs(sx - minX) < TOL && Math.abs(ex - minX) < TOL;
    const onMaxX = Math.abs(sx - maxX) < TOL && Math.abs(ex - maxX) < TOL;
    const onMinY = Math.abs(sy - minY) < TOL && Math.abs(ey - minY) < TOL;
    const onMaxY = Math.abs(sy - maxY) < TOL && Math.abs(ey - maxY) < TOL;
    return onMinX || onMaxX || onMinY || onMaxY;
  });
}

/**
 * Generate spolia scatter on all facade walls and add to a Three.js group.
 * @param {object} model - The building model
 * @param {THREE.Group} targetGroup - Group to add meshes to
 * @returns {THREE.Group} The scatter group (child of targetGroup)
 */
export function generateFacadeScatter(model, targetGroup) {
  const scatterGroup = new THREE.Group();
  scatterGroup.name = 'facade-scatter';

  const facadeWalls = findFacadeWalls(model);
  if (facadeWalls.length === 0) return scatterGroup;

  const storey = model.storeys.find(s => s.id === model.activeStorey) || model.storeys[0];
  const elevation = storey?.elevation || 0;
  const MM = 0.001; // mm to meters

  for (const wall of facadeWalls) {
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const wallLen = Math.sqrt(dx * dx + dy * dy);
    if (wallLen < 0.1) continue;

    const angle = Math.atan2(dy, dx);
    const dirX = dx / wallLen;
    const dirY = dy / wallLen;
    // Normal pointing outward (perpendicular to wall direction)
    const normX = -dirY;
    const normY = dirX;

    const wallLenMM = wallLen * 1000;
    const wallHeightMM = wall.height * 1000;

    // Generate slots using bitmap packing
    const slots = packWallSurface(wallLenMM, wallHeightMM);

    for (const slot of slots) {
      const w = slot.width * MM;
      const h = slot.height * MM;
      const d = slot.depth * MM;

      // Position along wall (slot.x is mm from wall start)
      const along = slot.x * MM + w / 2;
      const up = slot.y * MM + h / 2;

      // World position: wall start + along wall direction + outward by half thickness + depth
      const outOffset = wall.thickness / 2 + d / 2;
      const px = wall.start.x + dirX * along + normX * outOffset;
      const pz = wall.start.y + dirY * along + normY * outOffset;
      const py = elevation + up;

      // Geometry
      const geo = new THREE.BoxGeometry(w, h, d);
      const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.65 + Math.random() * 0.25,
        metalness: 0.05 + Math.random() * 0.1,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(px, py, pz);
      mesh.rotation.y = -angle;
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      // Slight random rotation for organic feel
      mesh.rotation.x += (Math.random() - 0.5) * 0.04;
      mesh.rotation.z += (Math.random() - 0.5) * 0.04;

      scatterGroup.add(mesh);

      // Edge outlines for larger pieces
      if (slot.width > 80 && slot.height > 80) {
        const edgeGeo = new THREE.EdgesGeometry(geo);
        const edgeMat = new THREE.LineBasicMaterial({
          color: 0x3a2a1a,
          transparent: true,
          opacity: 0.2,
        });
        const edges = new THREE.LineSegments(edgeGeo, edgeMat);
        edges.position.copy(mesh.position);
        edges.rotation.copy(mesh.rotation);
        scatterGroup.add(edges);
      }
    }
  }

  targetGroup.add(scatterGroup);
  return scatterGroup;
}

/**
 * Remove any existing scatter group from the target group.
 */
export function clearFacadeScatter(targetGroup) {
  const existing = targetGroup.getObjectByName('facade-scatter');
  if (existing) {
    existing.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
    targetGroup.remove(existing);
  }
}
