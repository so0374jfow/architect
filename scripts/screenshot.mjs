#!/usr/bin/env node
// screenshot.mjs — Render the Architect app and capture 2D floorplan screenshots
// Usage: node scripts/screenshot.mjs [--hash <base64hash>] [--out <dir>]
//
// Starts the dev server, loads the design, captures the 2D floorplan view.
// Works offline (no CDN needed) by using a minimal rendering page.

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

// Parse args
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

const hash = getArg('hash');
const outDir = getArg('out') || join(projectRoot, 'screenshots');

mkdirSync(outDir, { recursive: true });

// Build a self-contained HTML page that renders the 2D floorplan
// This avoids the Three.js CDN dependency entirely
function buildRenderPage(modelHash) {
  const buildingModelSrc = readFileSync(join(projectRoot, 'public/building-model.js'), 'utf-8');
  const renderer2dSrc = readFileSync(join(projectRoot, 'public/renderer-2d.js'), 'utf-8');

  // Extract the createDemoModel function from app.js
  const appSrc = readFileSync(join(projectRoot, 'public/app.js'), 'utf-8');
  const demoMatch = appSrc.match(/function createDemoModel\(\)\s*\{[\s\S]*?\n\}/);
  const demoFn = demoMatch ? demoMatch[0] : 'function createDemoModel() { return createDefaultModel(); }';

  return `<!DOCTYPE html>
<html><head><style>
  body { margin: 0; background: #1a1b2e; }
  canvas { display: block; }
</style></head><body>
<canvas id="canvas-2d" width="1400" height="900"></canvas>
<script type="module">
// ── Building Model ──
${buildingModelSrc.replace(/^export /gm, '')}

// ── 2D Renderer ──
${renderer2dSrc.replace(/^export /gm, '')}

// ── Demo Model ──
${demoFn}

// ── Render ──
const canvas = document.getElementById('canvas-2d');
canvas.width = 1400 * 2;
canvas.height = 900 * 2;
canvas.style.width = '1400px';
canvas.style.height = '900px';

let model;
${modelHash ? `
try {
  const json = decodeURIComponent(escape(atob('${modelHash}')));
  model = JSON.parse(json);
} catch(e) {
  model = createDemoModel();
}
` : `
model = createDemoModel();
`}

const r2d = new Renderer2D(canvas);
r2d.resize();
r2d.centerOn(model);
r2d.render(model);

window.__screenshotReady = true;
</script></body></html>`;
}

async function run() {
  const html = buildRenderPage(hash);
  const htmlPath = join(outDir, '_render.html');
  writeFileSync(htmlPath, html);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  await page.goto(`file://${htmlPath}`, { waitUntil: 'load' });

  // Wait for render to complete
  await page.waitForFunction(() => window.__screenshotReady === true, { timeout: 5000 });
  await page.waitForTimeout(300); // extra buffer for canvas paint

  const screenshotPath = join(outDir, 'floorplan.png');
  const canvas = page.locator('#canvas-2d');
  await canvas.screenshot({ path: screenshotPath });

  await browser.close();

  console.log(screenshotPath);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
