// renderer-2d.js — Canvas 2D architectural floorplan renderer
// Black walls on white background, proper door/window symbols, mitered wall joints

const GRID_SIZE = 1; // 1 meter grid

export class Renderer2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scale = 40; // pixels per meter
    this.offsetX = 0;
    this.offsetY = 0;
    this.selectedId = null;

    // Pan & zoom (mouse)
    this._dragging = false;
    this._lastMouse = { x: 0, y: 0 };

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      this.offsetX = mx - (mx - this.offsetX) * zoomFactor;
      this.offsetY = my - (my - this.offsetY) * zoomFactor;
      this.scale *= zoomFactor;
    });

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
        this._dragging = true;
        this._lastMouse = { x: e.clientX, y: e.clientY };
        canvas.style.cursor = 'grabbing';
      }
    });
    canvas.addEventListener('mousemove', (e) => {
      if (this._dragging) {
        this.offsetX += e.clientX - this._lastMouse.x;
        this.offsetY += e.clientY - this._lastMouse.y;
        this._lastMouse = { x: e.clientX, y: e.clientY };
      }
    });
    canvas.addEventListener('mouseup', () => { this._dragging = false; canvas.style.cursor = 'default'; });
    canvas.addEventListener('mouseleave', () => { this._dragging = false; canvas.style.cursor = 'default'; });

    // Touch support (iOS / mobile)
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        this._dragging = true;
        this._lastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
      if (e.touches.length === 2) {
        this._pinchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (e.touches.length === 1 && this._dragging) {
        this.offsetX += e.touches[0].clientX - this._lastMouse.x;
        this.offsetY += e.touches[0].clientY - this._lastMouse.y;
        this._lastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
      if (e.touches.length === 2 && this._pinchDist) {
        const newDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
        const zoomFactor = newDist / this._pinchDist;
        const rect = canvas.getBoundingClientRect();
        const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        const my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
        this.offsetX = mx - (mx - this.offsetX) * zoomFactor;
        this.offsetY = my - (my - this.offsetY) * zoomFactor;
        this.scale *= zoomFactor;
        this._pinchDist = newDist;
      }
    }, { passive: false });

    canvas.addEventListener('touchend', () => { this._dragging = false; this._pinchDist = null; });
  }

  toScreen(x, y) {
    return { x: x * this.scale + this.offsetX, y: y * this.scale + this.offsetY };
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  centerOn(model) {
    const storey = model.storeys.find((s) => s.id === model.activeStorey) || model.storeys[0];
    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);
    if (!storey || storey.walls.length === 0) {
      this.offsetX = w / 2;
      this.offsetY = h / 2;
      return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const wall of storey.walls) {
      minX = Math.min(minX, wall.start.x, wall.end.x);
      minY = Math.min(minY, wall.start.y, wall.end.y);
      maxX = Math.max(maxX, wall.start.x, wall.end.x);
      maxY = Math.max(maxY, wall.start.y, wall.end.y);
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const spanX = maxX - minX + 4;
    const spanY = maxY - minY + 4;
    this.scale = Math.min(w / spanX, h / spanY, 80);
    this.offsetX = w / 2 - cx * this.scale;
    this.offsetY = h / 2 - cy * this.scale;
  }

  // ── Main render ───────────────────────────────────────────────

  render(model) {
    const ctx = this.ctx;
    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);

    // White background (architectural plan style)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    // Light grid
    this._drawGrid(w, h);

    const storey = model.storeys.find((s) => s.id === model.activeStorey) || model.storeys[0];
    if (!storey) return;

    // Compute wall joint miters
    const miters = this._computeMiters(storey.walls);

    // Draw walls as filled black polygons with mitered joints
    this._drawWalls(storey.walls, miters);

    // Draw openings on top (they cut into the black walls)
    for (const wall of storey.walls) {
      for (const opening of wall.openings) {
        this._drawOpening(wall, opening);
      }
    }

    // Dimension labels
    this._drawDimensions(storey.walls);

    // Info label
    ctx.fillStyle = '#999999';
    ctx.font = '11px "Helvetica Neue", Helvetica, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${storey.name}  —  ${model.name}`, 10, h - 8);

    // Scale bar
    this._drawScaleBar(w, h);
  }

  // ── Grid ──────────────────────────────────────────────────────

  _drawGrid(w, h) {
    const ctx = this.ctx;
    const step = GRID_SIZE * this.scale;
    if (step < 8) return;

    const startX = this.offsetX % step;
    const startY = this.offsetY % step;

    for (let x = startX; x < w; x += step) {
      const worldX = Math.round((x - this.offsetX) / this.scale);
      ctx.strokeStyle = worldX % 5 === 0 ? '#d0d0d0' : '#e8e8e8';
      ctx.lineWidth = worldX % 5 === 0 ? 0.5 : 0.3;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = startY; y < h; y += step) {
      const worldY = Math.round((y - this.offsetY) / this.scale);
      ctx.strokeStyle = worldY % 5 === 0 ? '#d0d0d0' : '#e8e8e8';
      ctx.lineWidth = worldY % 5 === 0 ? 0.5 : 0.3;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  }

  // ── Wall joint mitering ───────────────────────────────────────

  _computeMiters(walls) {
    // For each wall endpoint, find connected walls and compute miter points
    // Result: Map<wallId, { start: [outerPt, innerPt] | null, end: [outerPt, innerPt] | null }>
    const TOLERANCE = 0.01;
    const result = new Map();

    for (const wall of walls) {
      result.set(wall.id, { start: null, end: null });
    }

    for (let i = 0; i < walls.length; i++) {
      for (let j = i + 1; j < walls.length; j++) {
        const w1 = walls[i];
        const w2 = walls[j];

        // Check all 4 endpoint combinations
        const pairs = [
          { p1: w1.start, p2: w2.start, e1: 'start', e2: 'start' },
          { p1: w1.start, p2: w2.end,   e1: 'start', e2: 'end' },
          { p1: w1.end,   p2: w2.start, e1: 'end',   e2: 'start' },
          { p1: w1.end,   p2: w2.end,   e1: 'end',   e2: 'end' },
        ];

        for (const { p1, p2, e1, e2 } of pairs) {
          const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
          if (dist > TOLERANCE) continue;

          // These walls share an endpoint — compute miter
          const miter = this._miterJoint(w1, e1, w2, e2);
          if (miter) {
            result.get(w1.id)[e1] = miter.w1;
            result.get(w2.id)[e2] = miter.w2;
          }
        }
      }
    }
    return result;
  }

  _miterJoint(w1, end1, w2, end2) {
    // Get wall direction vectors (pointing away from the shared endpoint)
    const d1 = this._wallDir(w1, end1);
    const d2 = this._wallDir(w2, end2);
    if (!d1 || !d2) return null;

    const halfT1 = w1.thickness / 2;
    const halfT2 = w2.thickness / 2;

    // Normal vectors (perpendicular, pointing "left" of direction)
    const n1 = { x: -d1.y, y: d1.x };
    const n2 = { x: -d2.y, y: d2.x };

    const shared = end1 === 'start' ? w1.start : w1.end;

    // Outer edges (offset by +halfT along normal)
    const outer1_a = { x: shared.x + n1.x * halfT1, y: shared.y + n1.y * halfT1 };
    const outer1_b = { x: outer1_a.x + d1.x, y: outer1_a.y + d1.y };
    const outer2_a = { x: shared.x + n2.x * halfT2, y: shared.y + n2.y * halfT2 };
    const outer2_b = { x: outer2_a.x + d2.x, y: outer2_a.y + d2.y };

    // Inner edges (offset by -halfT along normal)
    const inner1_a = { x: shared.x - n1.x * halfT1, y: shared.y - n1.y * halfT1 };
    const inner1_b = { x: inner1_a.x + d1.x, y: inner1_a.y + d1.y };
    const inner2_a = { x: shared.x - n2.x * halfT2, y: shared.y - n2.y * halfT2 };
    const inner2_b = { x: inner2_a.x + d2.x, y: inner2_a.y + d2.y };

    // Find intersections of outer-outer and inner-inner
    const outerMiter = lineIntersect(outer1_a, outer1_b, outer2_a, outer2_b);
    const innerMiter = lineIntersect(inner1_a, inner1_b, inner2_a, inner2_b);

    if (!outerMiter || !innerMiter) return null;

    // Miter limit: if angle is too acute, the miter point goes too far
    const miterDist = Math.hypot(outerMiter.x - shared.x, outerMiter.y - shared.y);
    const maxMiter = Math.max(halfT1, halfT2) * 4;
    if (miterDist > maxMiter) return null; // Fall back to default (no miter)

    return {
      w1: { outer: outerMiter, inner: innerMiter },
      w2: { outer: innerMiter, inner: outerMiter }, // Swapped for the other wall
    };
  }

  _wallDir(wall, fromEnd) {
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return null;
    // Direction pointing AWAY from the shared endpoint (into the wall)
    if (fromEnd === 'start') {
      return { x: dx / len, y: dy / len };
    } else {
      return { x: -dx / len, y: -dy / len };
    }
  }

  // ── Draw walls with miters ────────────────────────────────────

  _drawWalls(walls, miters) {
    const ctx = this.ctx;

    for (const wall of walls) {
      const dx = wall.end.x - wall.start.x;
      const dy = wall.end.y - wall.start.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) continue;

      const nx = -dy / len;
      const ny = dx / len;
      const halfT = wall.thickness / 2;

      const miter = miters.get(wall.id);

      // Default corner points (no miter)
      let startOuter = { x: wall.start.x + nx * halfT, y: wall.start.y + ny * halfT };
      let startInner = { x: wall.start.x - nx * halfT, y: wall.start.y - ny * halfT };
      let endOuter   = { x: wall.end.x + nx * halfT,   y: wall.end.y + ny * halfT };
      let endInner   = { x: wall.end.x - nx * halfT,   y: wall.end.y - ny * halfT };

      // Apply miters
      if (miter?.start) {
        startOuter = miter.start.outer;
        startInner = miter.start.inner;
      }
      if (miter?.end) {
        endOuter = miter.end.outer;
        endInner = miter.end.inner;
      }

      // Convert to screen coords
      const so = this.toScreen(startOuter.x, startOuter.y);
      const si = this.toScreen(startInner.x, startInner.y);
      const eo = this.toScreen(endOuter.x, endOuter.y);
      const ei = this.toScreen(endInner.x, endInner.y);

      const isSelected = wall.id === this.selectedId;

      // Fill wall polygon (solid black)
      ctx.fillStyle = isSelected ? '#cc0000' : '#000000';
      ctx.beginPath();
      ctx.moveTo(so.x, so.y);
      ctx.lineTo(eo.x, eo.y);
      ctx.lineTo(ei.x, ei.y);
      ctx.lineTo(si.x, si.y);
      ctx.closePath();
      ctx.fill();
    }
  }

  // ── Draw openings ─────────────────────────────────────────────

  _drawOpening(wall, opening) {
    const ctx = this.ctx;
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const wallLen = Math.sqrt(dx * dx + dy * dy);
    if (wallLen === 0) return;

    const nx = -dy / wallLen;
    const ny = dx / wallLen;
    const halfT = (wall.thickness / 2) * this.scale;
    const halfW = opening.width / 2;

    // Opening center and edges along wall
    const t1 = (opening.position - halfW) / wallLen;
    const t2 = (opening.position + halfW) / wallLen;

    const p1 = this.toScreen(wall.start.x + dx * t1, wall.start.y + dy * t1);
    const p2 = this.toScreen(wall.start.x + dx * t2, wall.start.y + dy * t2);

    // Clear the wall section (white rectangle)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(p1.x + nx * (halfT + 2), p1.y + ny * (halfT + 2));
    ctx.lineTo(p2.x + nx * (halfT + 2), p2.y + ny * (halfT + 2));
    ctx.lineTo(p2.x - nx * (halfT + 2), p2.y - ny * (halfT + 2));
    ctx.lineTo(p1.x - nx * (halfT + 2), p1.y - ny * (halfT + 2));
    ctx.closePath();
    ctx.fill();

    if (opening.type === 'door') {
      this._drawDoor(p1, p2, nx, ny, halfT, opening);
    } else {
      this._drawWindow(p1, p2, nx, ny, halfT, opening);
    }
  }

  _drawDoor(p1, p2, nx, ny, halfT, opening) {
    const ctx = this.ctx;
    const doorWidth = opening.width * this.scale;

    ctx.strokeStyle = '#000000';
    ctx.fillStyle = 'none';
    ctx.lineWidth = 1;

    // Jamb lines (short perpendicular lines at wall edge)
    ctx.beginPath();
    ctx.moveTo(p1.x + nx * halfT, p1.y + ny * halfT);
    ctx.lineTo(p1.x - nx * halfT, p1.y - ny * halfT);
    ctx.moveTo(p2.x + nx * halfT, p2.y + ny * halfT);
    ctx.lineTo(p2.x - nx * halfT, p2.y - ny * halfT);
    ctx.stroke();

    // Door leaf (thin line from hinge to open position)
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p1.x + nx * doorWidth, p1.y + ny * doorWidth);
    ctx.stroke();

    // Quarter-circle arc (door swing)
    ctx.lineWidth = 0.7;
    const angle1 = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const angle2 = Math.atan2(ny, nx);
    ctx.beginPath();
    ctx.arc(p1.x, p1.y, doorWidth, angle2, angle1, false);
    ctx.stroke();
  }

  _drawWindow(p1, p2, nx, ny, halfT, opening) {
    const ctx = this.ctx;

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;

    // Jamb lines
    ctx.beginPath();
    ctx.moveTo(p1.x + nx * halfT, p1.y + ny * halfT);
    ctx.lineTo(p1.x - nx * halfT, p1.y - ny * halfT);
    ctx.moveTo(p2.x + nx * halfT, p2.y + ny * halfT);
    ctx.lineTo(p2.x - nx * halfT, p2.y - ny * halfT);
    ctx.stroke();

    // Window frame: two parallel lines along wall thickness
    const frameOffset = halfT * 0.35;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(p1.x + nx * frameOffset, p1.y + ny * frameOffset);
    ctx.lineTo(p2.x + nx * frameOffset, p2.y + ny * frameOffset);
    ctx.moveTo(p1.x - nx * frameOffset, p1.y - ny * frameOffset);
    ctx.lineTo(p2.x - nx * frameOffset, p2.y - ny * frameOffset);
    ctx.stroke();

    // Glass pane line (center)
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }

  // ── Dimensions ────────────────────────────────────────────────

  _drawDimensions(walls) {
    const ctx = this.ctx;
    ctx.fillStyle = '#666666';
    ctx.font = '9px "Helvetica Neue", Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const wall of walls) {
      const dx = wall.end.x - wall.start.x;
      const dy = wall.end.y - wall.start.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 0.5) continue;

      const nx = -dy / len;
      const ny = dx / len;
      const offset = (wall.thickness / 2 + 0.3) * this.scale;

      const mx = (wall.start.x + wall.end.x) / 2;
      const my = (wall.start.y + wall.end.y) / 2;
      const s = this.toScreen(mx + nx * (wall.thickness / 2 + 0.3), my + ny * (wall.thickness / 2 + 0.3));

      // Rotate text along wall
      const angle = Math.atan2(dy, dx);
      ctx.save();
      ctx.translate(s.x, s.y);
      let rotation = -angle;
      // Keep text readable (not upside down)
      if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) {
        rotation += Math.PI;
      }
      ctx.rotate(rotation);
      ctx.fillText(`${len.toFixed(1)}`, 0, 0);
      ctx.restore();
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // ── Scale bar ─────────────────────────────────────────────────

  _drawScaleBar(w, h) {
    const ctx = this.ctx;
    const barLen = this.scale; // 1 meter
    const x = w - barLen - 20;
    const y = h - 20;

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + barLen, y);
    ctx.moveTo(x, y - 3);
    ctx.lineTo(x, y + 3);
    ctx.moveTo(x + barLen, y - 3);
    ctx.lineTo(x + barLen, y + 3);
    ctx.stroke();

    ctx.fillStyle = '#000000';
    ctx.font = '9px "Helvetica Neue", Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('1 m', x + barLen / 2, y - 6);
    ctx.textAlign = 'left';
  }
}

// ── Geometry helpers ──────────────────────────────────────────

function lineIntersect(a1, a2, b1, b2) {
  const dx1 = a2.x - a1.x, dy1 = a2.y - a1.y;
  const dx2 = b2.x - b1.x, dy2 = b2.y - b1.y;
  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < 1e-10) return null; // Parallel
  const t = ((b1.x - a1.x) * dy2 - (b1.y - a1.y) * dx2) / denom;
  return { x: a1.x + t * dx1, y: a1.y + t * dy1 };
}
