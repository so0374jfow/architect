// Procedural Salt Lake Temple-style cathedral.
// Builds a root Group whose direct children are independent "chunks"
// (towers, wall segments, parapets, the roof, the buttresses).
// Each chunk gets a stable initial transform stored on userData so the
// fragmentation choreographer can lerp between assembled / scattered states.

import * as THREE from 'three';

const GRANITE = new THREE.MeshStandardMaterial({
  color: 0xeaeaea,
  roughness: 0.55,
  metalness: 0.02,
  emissive: 0x303035,
  flatShading: false,
});

const GRANITE_DARK = new THREE.MeshStandardMaterial({
  color: 0xc0c0c0,
  roughness: 0.7,
  metalness: 0.0,
  emissive: 0x202024,
});

const ROOF = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.35,
  metalness: 0.05,
  emissive: 0x484848,
});

function asChunk(mesh, label) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.rest = {
    position: mesh.position.clone(),
    quaternion: mesh.quaternion.clone(),
    scale: mesh.scale.clone(),
  };
  mesh.userData.label = label;
  mesh.userData.spinAxis = new THREE.Vector3(
    Math.random() - 0.5,
    Math.random() - 0.5,
    Math.random() - 0.5,
  ).normalize();
  mesh.userData.spinSpeed = 0.3 + Math.random() * 1.2;
  mesh.userData.scatterDir = mesh.position.clone()
    .add(new THREE.Vector3(
      (Math.random() - 0.5) * 0.6,
      Math.random() * 0.6 + 0.2,
      (Math.random() - 0.5) * 0.6,
    ));
  if (mesh.userData.scatterDir.length() < 0.01) {
    mesh.userData.scatterDir.set(0, 1, 0);
  }
  return mesh;
}

// Flatten a Group (with optional nested transforms) into its constituent
// Meshes attached directly to `root`, baking each Mesh's world transform.
// Then register each as a separate chunk so it scatters independently.
function explodeIntoChunks(group, root, labelPrefix) {
  group.updateMatrixWorld(true);
  const collected = [];
  group.traverse(o => { if (o.isMesh) collected.push(o); });
  let i = 0;
  for (const m of collected) {
    const world = m.matrixWorld.clone();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    world.decompose(pos, quat, scl);
    m.position.copy(pos);
    m.quaternion.copy(quat);
    m.scale.copy(scl);
    m.matrixAutoUpdate = true;
    if (m.parent) m.parent.remove(m);
    root.add(asChunk(m, `${labelPrefix}-${i++}`));
  }
}

// ─── Spire ──────────────────────────────────────────────────────────────
function buildSpire(baseSize, baseHeight, spireHeight, withFinial = true) {
  const group = new THREE.Group();

  // Lower tower block
  const baseGeo = new THREE.BoxGeometry(baseSize, baseHeight, baseSize);
  const baseMesh = new THREE.Mesh(baseGeo, GRANITE);
  baseMesh.position.y = baseHeight / 2;
  group.add(baseMesh);

  // Crenellated parapet ring just above the base
  const parapetRing = new THREE.Group();
  const merlonCount = 4;
  for (let i = 0; i < merlonCount; i++) {
    const merlon = new THREE.Mesh(
      new THREE.BoxGeometry(baseSize / merlonCount * 0.7, baseHeight * 0.08, baseSize * 0.08),
      GRANITE_DARK,
    );
    merlon.position.set(
      -baseSize / 2 + (i + 0.5) * baseSize / merlonCount,
      baseHeight + baseHeight * 0.04,
      baseSize / 2 - baseSize * 0.04,
    );
    parapetRing.add(merlon);

    const merlonBack = merlon.clone();
    merlonBack.position.z = -baseSize / 2 + baseSize * 0.04;
    parapetRing.add(merlonBack);

    const merlonR = new THREE.Mesh(
      new THREE.BoxGeometry(baseSize * 0.08, baseHeight * 0.08, baseSize / merlonCount * 0.7),
      GRANITE_DARK,
    );
    merlonR.position.set(
      baseSize / 2 - baseSize * 0.04,
      baseHeight + baseHeight * 0.04,
      -baseSize / 2 + (i + 0.5) * baseSize / merlonCount,
    );
    parapetRing.add(merlonR);

    const merlonL = merlonR.clone();
    merlonL.position.x = -baseSize / 2 + baseSize * 0.04;
    parapetRing.add(merlonL);
  }
  group.add(parapetRing);

  // Conical spire on top
  const spireGeo = new THREE.ConeGeometry(baseSize * 0.42, spireHeight, 4, 1);
  const spire = new THREE.Mesh(spireGeo, GRANITE);
  spire.rotation.y = Math.PI / 4;
  spire.position.y = baseHeight + spireHeight / 2;
  group.add(spire);

  // Small finial
  if (withFinial) {
    const finial = new THREE.Mesh(
      new THREE.ConeGeometry(baseSize * 0.04, baseSize * 0.5, 6),
      ROOF,
    );
    finial.position.y = baseHeight + spireHeight + baseSize * 0.25;
    group.add(finial);
  }

  // Corner pinnacles
  const pinnacleHeight = baseHeight * 0.4;
  const pinnacleSize = baseSize * 0.14;
  for (let cx = -1; cx <= 1; cx += 2) {
    for (let cz = -1; cz <= 1; cz += 2) {
      const pinBase = new THREE.Mesh(
        new THREE.BoxGeometry(pinnacleSize, pinnacleHeight, pinnacleSize),
        GRANITE,
      );
      pinBase.position.set(
        cx * (baseSize / 2 - pinnacleSize * 0.5),
        baseHeight + pinnacleHeight / 2,
        cz * (baseSize / 2 - pinnacleSize * 0.5),
      );
      group.add(pinBase);

      const pinTop = new THREE.Mesh(
        new THREE.ConeGeometry(pinnacleSize * 0.55, pinnacleHeight * 0.9, 4),
        GRANITE,
      );
      pinTop.rotation.y = Math.PI / 4;
      pinTop.position.set(
        pinBase.position.x,
        baseHeight + pinnacleHeight + pinnacleHeight * 0.45,
        pinBase.position.z,
      );
      group.add(pinTop);
    }
  }

  return group;
}

// ─── Window arch panel (gothic arch + recessed window) ──────────────────
function buildWindowPanel(width, height) {
  const group = new THREE.Group();
  // Recessed window: a darker plane sunk into the wall
  const recess = new THREE.Mesh(
    new THREE.PlaneGeometry(width * 0.7, height * 0.78),
    new THREE.MeshStandardMaterial({
      color: 0x202020,
      roughness: 0.9,
      metalness: 0.0,
      emissive: 0x050505,
    }),
  );
  recess.position.z = 0.01;
  group.add(recess);
  // Arch top: a half-disc plane above the rectangle for gothic shape suggestion
  const arch = new THREE.Mesh(
    new THREE.CircleGeometry(width * 0.35, 12, 0, Math.PI),
    new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.95,
    }),
  );
  arch.rotation.z = 0;
  arch.position.set(0, height * 0.4, 0.012);
  group.add(arch);
  return group;
}

// ─── Long wall with repeated arches ─────────────────────────────────────
function buildLongWall(length, height, depth, windowCount, faceSign) {
  const group = new THREE.Group();
  const wallGeo = new THREE.BoxGeometry(length, height, depth);
  const wall = new THREE.Mesh(wallGeo, GRANITE);
  wall.position.y = height / 2;
  group.add(wall);

  // Crenellated parapet on top
  const parapetCount = Math.floor(length / 1.2);
  for (let i = 0; i < parapetCount; i++) {
    const t = (i + 0.5) / parapetCount;
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(length / parapetCount * 0.55, height * 0.06, depth * 1.05),
      GRANITE_DARK,
    );
    m.position.set(
      -length / 2 + t * length,
      height + height * 0.03,
      0,
    );
    group.add(m);
  }

  // Window panels on the outward face
  const winWidth = (length - 1.2) / windowCount;
  const winHeight = height * 0.6;
  for (let i = 0; i < windowCount; i++) {
    const winPanel = buildWindowPanel(winWidth * 0.85, winHeight);
    winPanel.position.set(
      -length / 2 + 0.6 + (i + 0.5) * winWidth,
      height * 0.45,
      (depth / 2 + 0.001) * faceSign,
    );
    if (faceSign < 0) winPanel.rotation.y = Math.PI;
    group.add(winPanel);
  }

  // Buttress fins on the outward face
  const buttressCount = windowCount + 1;
  for (let i = 0; i < buttressCount; i++) {
    const t = i / (buttressCount - 1);
    const fin = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, height * 0.92, depth * 0.35),
      GRANITE_DARK,
    );
    fin.position.set(
      -length / 2 + 0.4 + t * (length - 0.8),
      height * 0.46,
      (depth / 2 + depth * 0.12) * faceSign,
    );
    group.add(fin);
  }

  return group;
}

// ─── Roof gable + central spire over the main hall ──────────────────────
function buildRoof(length, width, height) {
  const group = new THREE.Group();
  // Pitched roof represented as a flat-ish elongated box (matches reference)
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(length * 0.95, height * 0.15, width * 0.85),
    ROOF,
  );
  slab.position.y = height / 2;
  group.add(slab);
  return group;
}

// ─── Stairs / pedestal in front ─────────────────────────────────────────
function buildSteps(length, width) {
  const group = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const step = new THREE.Mesh(
      new THREE.BoxGeometry(length, 0.18, width - i * 0.45),
      GRANITE_DARK,
    );
    step.position.set(0, 0.09 + i * 0.18, -width / 2 - 0.5 + i * 0.225);
    group.add(step);
  }
  return group;
}

// ─── Public: assemble the whole cathedral ───────────────────────────────
export function buildCathedral() {
  const root = new THREE.Group();
  root.name = 'Cathedral';

  // Main hall dimensions (approx Salt Lake Temple proportions, scaled down)
  const HALL_LEN = 8;
  const HALL_WID = 3.6;
  const HALL_HGT = 4.2;
  const WALL_DEPTH = 0.6;
  const SPIRE_BASE = 1.7;
  const SPIRE_BASE_H = 5.0;
  const SPIRE_TALL = 4.4;
  const SPIRE_SHORT = 3.2;

  // Main hall, split lengthwise so the shatter is granular
  const HALL_SEGMENTS = 5;
  for (let i = 0; i < HALL_SEGMENTS; i++) {
    const segLen = HALL_LEN / HALL_SEGMENTS;
    const seg = new THREE.Mesh(
      new THREE.BoxGeometry(segLen * 0.99, HALL_HGT, HALL_WID),
      GRANITE,
    );
    seg.position.set(-HALL_LEN / 2 + (i + 0.5) * segLen, HALL_HGT / 2, 0);
    root.add(asChunk(seg, `hall-${i}`));
  }

  // Long walls with windows — split into per-segment groups, then exploded
  for (let i = 0; i < HALL_SEGMENTS; i++) {
    const segLen = (HALL_LEN * 0.96) / HALL_SEGMENTS;
    const winsPerSeg = Math.max(1, Math.round(6 / HALL_SEGMENTS));
    const north = buildLongWall(segLen, HALL_HGT * 0.94, WALL_DEPTH, winsPerSeg, +1);
    north.position.set(
      -HALL_LEN * 0.48 + (i + 0.5) * segLen,
      0,
      HALL_WID / 2 - WALL_DEPTH * 0.4,
    );
    explodeIntoChunks(north, root, `wall-n-${i}`);

    const south = buildLongWall(segLen, HALL_HGT * 0.94, WALL_DEPTH, winsPerSeg, -1);
    south.position.set(
      -HALL_LEN * 0.48 + (i + 0.5) * segLen,
      0,
      -HALL_WID / 2 + WALL_DEPTH * 0.4,
    );
    explodeIntoChunks(south, root, `wall-s-${i}`);
  }

  // Roof — single chunk; it's the bright "lit" surface and should hold together
  const roof = buildRoof(HALL_LEN, HALL_WID, HALL_HGT * 0.32);
  roof.position.y = HALL_HGT + HALL_HGT * 0.05;
  root.add(asChunk(roof, 'roof'));

  // Six spires: 3 clustered east, 3 clustered west.
  // Layout per cluster: tall center + two shorter flanking towers.
  function placeCluster(clusterX, isTall) {
    const clusterDirZ = HALL_WID / 2 + SPIRE_BASE * 0.6;
    const config = [
      { dx: 0, dz: 0, tall: true },
      { dx: 0, dz: clusterDirZ - HALL_WID / 2 - 0.05, tall: false },
      { dx: 0, dz: -(clusterDirZ - HALL_WID / 2 - 0.05), tall: false },
    ];
    for (const c of config) {
      const tall = c.tall && isTall;
      const spire = buildSpire(
        SPIRE_BASE,
        SPIRE_BASE_H,
        tall ? SPIRE_TALL : SPIRE_SHORT,
        true,
      );
      spire.position.set(
        clusterX + c.dx,
        0,
        c.dz,
      );
      if (!c.tall) {
        spire.scale.set(0.85, 0.85, 0.85);
        spire.position.y = 0;
      }
      // Explode each spire into its constituent meshes so individual
      // pinnacles, finials, and the cone fragment independently.
      explodeIntoChunks(spire, root, 'spire');
    }
  }
  placeCluster(+HALL_LEN / 2 - SPIRE_BASE * 0.1, true);   // east cluster (tall)
  placeCluster(-HALL_LEN / 2 + SPIRE_BASE * 0.1, false);  // west cluster (slightly shorter overall)

  // Steps in front (east entrance)
  const steps = buildSteps(HALL_WID * 0.7, 1.4);
  steps.position.set(HALL_LEN / 2 + 0.8, 0, 0);
  steps.rotation.y = Math.PI / 2;
  explodeIntoChunks(steps, root, 'step');

  // Ground pedestal — large dark slab the cathedral sits on
  const pedestal = new THREE.Mesh(
    new THREE.BoxGeometry(HALL_LEN + 4.0, 0.5, HALL_WID + 4.0),
    new THREE.MeshStandardMaterial({
      color: 0x444444,
      roughness: 0.95,
    }),
  );
  pedestal.position.y = -0.25;
  root.add(asChunk(pedestal, 'pedestal'));

  // Compute bounds and shift so the visual center is at origin
  const bbox = new THREE.Box3().setFromObject(root);
  const center = bbox.getCenter(new THREE.Vector3());
  root.position.sub(center);
  // Re-cache rest transforms after the shift
  for (const child of root.children) {
    child.userData.rest.position.copy(child.position);
  }

  root.userData.bounds = bbox;
  return root;
}

// Return all renderable meshes (deep traversal)
export function collectMeshes(root) {
  const out = [];
  root.traverse(o => {
    if (o.isMesh) out.push(o);
  });
  return out;
}
