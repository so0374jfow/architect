// sacred_not_secret — Three.js rebuild of macbethAI's HERMES Agent Creative Hackathon entry.
// No audio. Procedural cathedral, halftone post-processing, fragmentation choreography,
// red wireframe diagnostic phase, and GLB export.

import * as THREE from 'three';
import { OrbitControls }   from 'three/addons/controls/OrbitControls.js';
import { EffectComposer }  from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }      from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass }      from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass }      from 'three/addons/postprocessing/OutputPass.js';
import { GLTFExporter }    from 'three/addons/exporters/GLTFExporter.js';
import { buildCathedral, collectMeshes } from './cathedral.js';
import { HalftoneShader }  from './halftone-shader.js';

// ── Scene / renderer ────────────────────────────────────────────────────
const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

// ── Lighting ────────────────────────────────────────────────────────────
// Strong key spotlight from above-front (creates the bright rooftop highlight
// seen in the reference frames). Stronger ambient + a second fill on the
// opposite side keep the spires from blacking out under the halftone shader.
const key = new THREE.SpotLight(0xffffff, 42, 0, Math.PI / 4.5, 0.45, 1.2);
key.position.set(8, 18, 6);
scene.add(key);
scene.add(key.target);

const fill = new THREE.DirectionalLight(0xc6cdda, 0.85);
fill.position.set(-8, 6, -10);
scene.add(fill);

const fill2 = new THREE.DirectionalLight(0x8e95a8, 0.55);
fill2.position.set(6, 4, -6);
scene.add(fill2);

const ambient = new THREE.AmbientLight(0x4a4e58, 1.35);
scene.add(ambient);

// Hemisphere — sky tint on top, ground tint underneath. Keeps tumbling
// fragments readable when they're outside the spotlight cone.
const hemi = new THREE.HemisphereLight(0xc4c8d2, 0x2a2a30, 0.6);
scene.add(hemi);

// A radial point light at the cathedral centre — picks up the inside of
// shattered chunks when they fly outwards.
const core = new THREE.PointLight(0xfff4d8, 12, 30, 1.5);
core.position.set(0, 5, 0);
scene.add(core);

// ── Camera + controls ───────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(15, 11, 17);
camera.lookAt(0, 3, 0);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 6;
controls.maxDistance = 50;
controls.target.set(0, 3, 0);

// ── Cathedral ───────────────────────────────────────────────────────────
const cathedral = buildCathedral();
scene.add(cathedral);
const chunks = cathedral.children.slice(); // each direct child is one chunk

// Save the rest transforms for every mesh too, for the red-wireframe swap
const meshes = collectMeshes(cathedral);
const originalMaterials = new Map();
for (const m of meshes) originalMaterials.set(m, m.material);

// ── Wireframe overlay (used in PHASE_WIRE) ──────────────────────────────
const wireGroup = new THREE.Group();
wireGroup.visible = false;
scene.add(wireGroup);
{
  const wireMat = new THREE.LineBasicMaterial({
    color: 0xff1a1a,
    transparent: true,
    opacity: 0.95,
  });
  for (const m of meshes) {
    if (!m.geometry) continue;
    const edges = new THREE.EdgesGeometry(m.geometry, 22);
    const lines = new THREE.LineSegments(edges, wireMat);
    lines.userData.source = m;
    wireGroup.add(lines);
  }
}

function syncWireframeToMeshes() {
  for (const line of wireGroup.children) {
    const src = line.userData.source;
    src.updateMatrixWorld(true);
    line.matrix.copy(src.matrixWorld);
    line.matrixAutoUpdate = false;
  }
}

// ── Post-processing: halftone ───────────────────────────────────────────
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const halftonePass = new ShaderPass(HalftoneShader);
halftonePass.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
composer.addPass(halftonePass);

composer.addPass(new OutputPass());

// ── Choreography state machine ──────────────────────────────────────────
// Phases roughly mirror the reference video (≈59s loop):
//   0 ASSEMBLE    — slow orbit, cathedral fully assembled (0-8s)
//   1 SHATTER     — chunks burst outward (8-18s)
//   2 DRIFT       — pieces float freely (18-28s)
//   3 REASSEMBLE  — chunks return towards rest (28-40s)
//   4 WIREFRAME   — pause in red-edge mode (40-50s)
//   5 FINAL       — back to assembled silhouette, halftone (50-59s)
const PHASES = [
  { name: 'ASSEMBLE',   duration: 8.0,  caption: 'sacred · not · secret'        },
  { name: 'SHATTER',    duration: 10.0, caption: 'fragmentation'                },
  { name: 'DRIFT',      duration: 10.0, caption: 'between forms'                },
  { name: 'REASSEMBLE', duration: 12.0, caption: 'reconvergence'                },
  { name: 'WIREFRAME',  duration: 10.0, caption: 'underdrawing'                 },
  { name: 'FINAL',      duration: 9.0,  caption: 'sacred · not · secret'        },
];

let phaseIdx = 0;
let phaseElapsed = 0;
let totalElapsed = 0;

const captionEl = document.getElementById('caption');
function setCaption(text, phase) {
  captionEl.textContent = text;
  captionEl.dataset.phase = phase;
}
setCaption(PHASES[0].caption, 0);

// ── Per-frame chunk transform update ────────────────────────────────────
const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function applyChunkState(t /* 0..1 of "shatter strength" */, time) {
  // t = 0 → fully assembled (rest transforms)
  // t = 1 → fully shattered (each chunk pushed outward + spinning)
  for (const chunk of chunks) {
    const rest = chunk.userData.rest;
    const dir = chunk.userData.scatterDir;
    const spinAxis = chunk.userData.spinAxis;
    const spinSpeed = chunk.userData.spinSpeed;

    // Scattered position: rest + radial offset scaled by t
    const scatterDistance = 6.0 * t;
    tmpV.copy(rest.position).addScaledVector(dir, scatterDistance);
    chunk.position.copy(tmpV);

    // Rotation: lerp between rest quaternion and a time-driven spin
    if (t > 0.001) {
      tmpQ.setFromAxisAngle(spinAxis, time * spinSpeed * t);
      chunk.quaternion.copy(rest.quaternion).multiply(tmpQ);
    } else {
      chunk.quaternion.copy(rest.quaternion);
    }
  }
}

// ── Camera choreography (gentle auto-orbit on top of user input) ────────
let autoOrbit = true;
let lastUserInteract = 0;
controls.addEventListener('start', () => { autoOrbit = false; lastUserInteract = performance.now(); });
controls.addEventListener('end',   () => { lastUserInteract = performance.now(); });

// Camera dollies outward when the cathedral fragments so the whole
// scatter cloud stays in frame, then dollies back in for the final.
let cameraDollyTarget = 1.0; // 1 = base distance, 1.6 = dolly out for shatter
const BASE_CAM = new THREE.Vector3(15, 11, 17);

function tickCamera(dt) {
  // Re-enable auto-orbit after 3s of idle
  if (!autoOrbit && performance.now() - lastUserInteract > 3000) autoOrbit = true;

  // Smooth dolly toward target multiplier
  const cur = camera.position.distanceTo(controls.target) / BASE_CAM.length();
  const next = THREE.MathUtils.lerp(cur, cameraDollyTarget, Math.min(1, dt * 1.2));
  const dir = camera.position.clone().sub(controls.target).normalize();
  camera.position.copy(controls.target).addScaledVector(dir, BASE_CAM.length() * next);

  if (autoOrbit) {
    const radius = Math.hypot(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
    const a = Math.atan2(camera.position.z - controls.target.z, camera.position.x - controls.target.x);
    const newA = a + dt * 0.08;
    camera.position.x = controls.target.x + Math.cos(newA) * radius;
    camera.position.z = controls.target.z + Math.sin(newA) * radius;
  }
}

// ── Wireframe phase swap ────────────────────────────────────────────────
function setWireframeMode(on) {
  wireGroup.visible = on;
  for (const m of meshes) m.visible = !on;
  halftonePass.uniforms.uWireframeMode.value = on ? 1.0 : 0.0;
  scene.background = on ? new THREE.Color(0x000000) : new THREE.Color(0x000000);
}

// ── Phase logic per frame ───────────────────────────────────────────────
function updatePhase(dt) {
  phaseElapsed += dt;
  totalElapsed += dt;
  const cur = PHASES[phaseIdx];
  if (phaseElapsed >= cur.duration) {
    phaseElapsed = 0;
    phaseIdx = (phaseIdx + 1) % PHASES.length;
    setCaption(PHASES[phaseIdx].caption, phaseIdx);
    setWireframeMode(PHASES[phaseIdx].name === 'WIREFRAME');
  }
  const p = PHASES[phaseIdx];
  const local = phaseElapsed / p.duration; // 0..1 within phase

  let shatter = 0;
  let cellPx = 5.0;
  let intensity = 0.95;
  let dolly = 1.0;

  switch (p.name) {
    case 'ASSEMBLE':
      shatter = 0;
      cellPx = 5.0;
      dolly = 1.0;
      break;
    case 'SHATTER':
      shatter = easeInOut(local);
      cellPx = 5.0 + local * 2.5;
      dolly = 1.0 + local * 0.55;
      break;
    case 'DRIFT':
      shatter = 1.0;
      cellPx = 7.5 + Math.sin(totalElapsed * 0.6) * 1.5;
      dolly = 1.55;
      break;
    case 'REASSEMBLE':
      shatter = 1.0 - easeInOut(local);
      cellPx = 7.0 - local * 2.5;
      dolly = 1.55 - local * 0.55;
      break;
    case 'WIREFRAME':
      shatter = 0;
      cellPx = 4.0;
      intensity = 0.0; // raw colour for the wireframe pass
      dolly = 1.05;
      break;
    case 'FINAL':
      shatter = 0;
      cellPx = 4.0 + Math.sin(totalElapsed * 0.4) * 0.6;
      dolly = 1.0;
      break;
  }

  cameraDollyTarget = dolly;
  applyChunkState(shatter, totalElapsed);
  halftonePass.uniforms.uCellPx.value    = cellPx;
  halftonePass.uniforms.uIntensity.value = intensity;
  halftonePass.uniforms.uTime.value      = totalElapsed;
}

// ── Resize ──────────────────────────────────────────────────────────────
function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  halftonePass.uniforms.uResolution.value.set(
    w * Math.min(window.devicePixelRatio, 2),
    h * Math.min(window.devicePixelRatio, 2),
  );
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);
onResize();

// ── Keyboard: space = advance phase, g = export GLB ─────────────────────
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    phaseElapsed = PHASES[phaseIdx].duration; // force advance
  } else if (e.key === 'g' || e.key === 'G') {
    exportGLB();
  } else if (e.key === 'p' || e.key === 'P') {
    autoOrbit = !autoOrbit;
  }
});

function exportGLB() {
  // Reset chunk transforms to rest before exporting so the export captures
  // the canonical assembled cathedral.
  applyChunkState(0, 0);
  const exporter = new GLTFExporter();
  exporter.parse(
    cathedral,
    (result) => {
      const blob = new Blob([result], { type: 'model/gltf-binary' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'sacred-not-secret-cathedral.glb';
      a.click();
      URL.revokeObjectURL(url);
    },
    (err) => console.error('GLB export failed', err),
    { binary: true },
  );
}

// ── Main loop ───────────────────────────────────────────────────────────
const clock = new THREE.Clock();
let paused = false;
function animate() {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  if (!paused) {
    updatePhase(dt);
    tickCamera(dt);
  }
  controls.update();
  if (wireGroup.visible) syncWireframeToMeshes();
  composer.render(dt);
  requestAnimationFrame(animate);
}
animate();

// Expose for debugging / headless capture
window.THREE = THREE;
window.SCENE = {
  THREE, scene, camera, renderer, composer, cathedral, exportGLB,
  applyChunkState, setWireframeMode, halftonePass, wireGroup,
  setPaused: (v) => { paused = !!v; },
  isPaused: () => paused,
};
