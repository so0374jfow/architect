// renderer-2d.js — Canvas 2D architectural floorplan renderer
// Proper architectural plan style: black filled walls, clean mitered joints, standard door/window symbols

export class Renderer2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scale = 40;
    this.offsetX = 0;
    this.offsetY = 0;
    this.selectedId = null;

    this._dragging = false;
    this._lastMouse = { x: 0, y: 0 };

    // Mouse pan/zoom
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const f = e.deltaY > 0 ? 0.9 : 1.1;
      const r = canvas.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      this.offsetX = mx - (mx - this.offsetX) * f;
      this.offsetY = my - (my - this.offsetY) * f;
      this.scale *= f;
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

    // Touch pan/pinch-zoom (iOS)
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        this._dragging = true;
        this._lastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
      if (e.touches.length === 2) {
        this._pinchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY);
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
        const nd = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        const f = nd / this._pinchDist;
        const r = canvas.getBoundingClientRect();
        const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left;
        const my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top;
        this.offsetX = mx - (mx - this.offsetX) * f;
        this.offsetY = my - (my - this.offsetY) * f;
        this.scale *= f;
        this._pinchDist = nd;
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
    const storey = model.storeys.find(s => s.id === model.activeStorey) || model.storeys[0];
    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);
    if (!storey || storey.walls.length === 0) {
      this.offsetX = w / 2; this.offsetY = h / 2; return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const wall of storey.walls) {
      minX = Math.min(minX, wall.start.x, wall.end.x);
      minY = Math.min(minY, wall.start.y, wall.end.y);
      maxX = Math.max(maxX, wall.start.x, wall.end.x);
      maxY = Math.max(maxY, wall.start.y, wall.end.y);
    }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    this.scale = Math.min(w / (maxX - minX + 4), h / (maxY - minY + 4), 80);
    this.offsetX = w / 2 - cx * this.scale;
    this.offsetY = h / 2 - cy * this.scale;
  }

  // ═══════════════════════════════════════════════════════════════
  // MAIN RENDER
  // ═══════════════════════════════════════════════════════════════

  render(model) {
    const ctx = this.ctx;
    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    this._drawGrid(w, h);

    const storey = model.storeys.find(s => s.id === model.activeStorey) || model.storeys[0];
    if (!storey) return;

    // Step 1: Compute mitered wall polygons
    const wallPolygons = computeWallPolygons(storey.walls);

    // Step 2: Draw all walls as filled black polygons
    for (const wp of wallPolygons) {
      this._drawWallPolygon(wp);
    }

    // Step 3: Draw openings (cut into walls, draw symbols)
    for (const wall of storey.walls) {
      for (const opening of wall.openings) {
        this._drawOpening(wall, opening);
      }
    }

    // Step 4: Dimensions
    this._drawDimensions(storey.walls);

    // Info
    ctx.fillStyle = '#999';
    ctx.font = '11px "Helvetica Neue", Helvetica, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${storey.name}  —  ${model.name}`, 10, h - 8);
    this._drawScaleBar(w, h);
  }

  _drawGrid(w, h) {
    const ctx = this.ctx;
    const step = this.scale;
    if (step < 8) return;
    const sx = this.offsetX % step, sy = this.offsetY % step;
    for (let x = sx; x < w; x += step) {
      const wx = Math.round((x - this.offsetX) / this.scale);
      ctx.strokeStyle = wx % 5 === 0 ? '#d0d0d0' : '#ebebeb';
      ctx.lineWidth = wx % 5 === 0 ? 0.5 : 0.25;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = sy; y < h; y += step) {
      const wy = Math.round((y - this.offsetY) / this.scale);
      ctx.strokeStyle = wy % 5 === 0 ? '#d0d0d0' : '#ebebeb';
      ctx.lineWidth = wy % 5 === 0 ? 0.5 : 0.25;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // WALL POLYGON DRAWING
  // ═══════════════════════════════════════════════════════════════

  _drawWallPolygon(wp) {
    const ctx = this.ctx;
    const pts = wp.polygon.map(p => this.toScreen(p.x, p.y));
    if (pts.length < 3) return;

    ctx.fillStyle = wp.id === this.selectedId ? '#cc0000' : '#000000';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fill();
  }

  // ═══════════════════════════════════════════════════════════════
  // OPENINGS (DOORS & WINDOWS)
  // ═══════════════════════════════════════════════════════════════

  _drawOpening(wall, opening) {
    const ctx = this.ctx;
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const wallLen = Math.sqrt(dx * dx + dy * dy);
    if (wallLen === 0) return;

    // Wall direction and normal
    const dirX = dx / wallLen, dirY = dy / wallLen;
    const nx = -dirY, ny = dirX;
    const halfT = wall.thickness / 2;
    const halfTpx = halfT * this.scale;

    // Opening edges along wall
    const halfW = opening.width / 2;
    const t1 = (opening.position - halfW) / wallLen;
    const t2 = (opening.position + halfW) / wallLen;

    // Opening edge points in world coords
    const wx1 = wall.start.x + dx * t1, wy1 = wall.start.y + dy * t1;
    const wx2 = wall.start.x + dx * t2, wy2 = wall.start.y + dy * t2;
    const p1 = this.toScreen(wx1, wy1);
    const p2 = this.toScreen(wx2, wy2);

    // Clear the wall section (white)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(p1.x + nx * (halfTpx + 2), p1.y + ny * (halfTpx + 2));
    ctx.lineTo(p2.x + nx * (halfTpx + 2), p2.y + ny * (halfTpx + 2));
    ctx.lineTo(p2.x - nx * (halfTpx + 2), p2.y - ny * (halfTpx + 2));
    ctx.lineTo(p1.x - nx * (halfTpx + 2), p1.y - ny * (halfTpx + 2));
    ctx.closePath();
    ctx.fill();

    if (opening.type === 'door') {
      this._drawDoor(p1, p2, nx, ny, halfTpx, opening);
    } else {
      this._drawWindow(p1, p2, nx, ny, halfTpx, opening);
    }
  }

  _drawDoor(p1, p2, nx, ny, halfTpx, opening) {
    // Architectural door symbol:
    // - Short jamb ticks at wall edges
    // - Thin straight line from hinge to open position (door leaf)
    // - Thin quarter-circle arc showing swing direction
    const ctx = this.ctx;
    const doorWidthPx = opening.width * this.scale;

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 0.8;

    // Jamb ticks (perpendicular lines at opening edges showing wall thickness)
    ctx.beginPath();
    ctx.moveTo(p1.x + nx * halfTpx, p1.y + ny * halfTpx);
    ctx.lineTo(p1.x - nx * halfTpx, p1.y - ny * halfTpx);
    ctx.moveTo(p2.x + nx * halfTpx, p2.y + ny * halfTpx);
    ctx.lineTo(p2.x - nx * halfTpx, p2.y - ny * halfTpx);
    ctx.stroke();

    // Door leaf: thin line from hinge point perpendicular to wall
    // Hinge is at p1, door swings towards +normal direction
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p1.x + nx * doorWidthPx, p1.y + ny * doorWidthPx);
    ctx.stroke();

    // Quarter-circle arc from end of leaf to p2
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    const angleToP2 = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const angleToLeaf = Math.atan2(ny, nx);
    ctx.arc(p1.x, p1.y, doorWidthPx, angleToLeaf, angleToP2, false);
    ctx.stroke();
  }

  _drawWindow(p1, p2, nx, ny, halfTpx, opening) {
    // Architectural window symbol:
    // - Jamb ticks at wall edges
    // - Two parallel lines along wall (frame)
    // - Thin center line (glass pane)
    const ctx = this.ctx;

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 0.8;

    // Jamb ticks
    ctx.beginPath();
    ctx.moveTo(p1.x + nx * halfTpx, p1.y + ny * halfTpx);
    ctx.lineTo(p1.x - nx * halfTpx, p1.y - ny * halfTpx);
    ctx.moveTo(p2.x + nx * halfTpx, p2.y + ny * halfTpx);
    ctx.lineTo(p2.x - nx * halfTpx, p2.y - ny * halfTpx);
    ctx.stroke();

    // Double frame lines
    const fo = halfTpx * 0.4;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(p1.x + nx * fo, p1.y + ny * fo);
    ctx.lineTo(p2.x + nx * fo, p2.y + ny * fo);
    ctx.moveTo(p1.x - nx * fo, p1.y - ny * fo);
    ctx.lineTo(p2.x - nx * fo, p2.y - ny * fo);
    ctx.stroke();

    // Center glass line
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }

  // ═══════════════════════════════════════════════════════════════
  // DIMENSIONS
  // ═══════════════════════════════════════════════════════════════

  _drawDimensions(walls) {
    const ctx = this.ctx;
    ctx.fillStyle = '#666';
    ctx.font = '9px "Helvetica Neue", Helvetica, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const wall of walls) {
      const dx = wall.end.x - wall.start.x, dy = wall.end.y - wall.start.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 0.5) continue;
      const nx = -dy / len, ny = dx / len;
      const mx = (wall.start.x + wall.end.x) / 2;
      const my = (wall.start.y + wall.end.y) / 2;
      const s = this.toScreen(mx + nx * (wall.thickness / 2 + 0.35), my + ny * (wall.thickness / 2 + 0.35));
      const angle = Math.atan2(dy, dx);
      ctx.save();
      ctx.translate(s.x, s.y);
      let rot = -angle;
      if (rot > Math.PI / 2 || rot < -Math.PI / 2) rot += Math.PI;
      ctx.rotate(rot);
      ctx.fillText(len.toFixed(1), 0, 0);
      ctx.restore();
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  _drawScaleBar(w, h) {
    const ctx = this.ctx;
    const barLen = this.scale;
    const x = w - barLen - 20, y = h - 20;
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + barLen, y);
    ctx.moveTo(x, y - 3); ctx.lineTo(x, y + 3);
    ctx.moveTo(x + barLen, y - 3); ctx.lineTo(x + barLen, y + 3);
    ctx.stroke();
    ctx.fillStyle = '#000';
    ctx.font = '9px "Helvetica Neue", Helvetica, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('1 m', x + barLen / 2, y - 6);
    ctx.textAlign = 'left';
  }
}

// ═══════════════════════════════════════════════════════════════
// WALL POLYGON COMPUTATION WITH MITERED JOINTS
//
// How CAD wall joining works (Vectorworks-style):
// Each wall is a rectangle (centerline offset by ±thickness/2).
// When two walls share an endpoint, we extend both walls' edge
// lines (left and right) until they intersect. Both walls share
// the SAME two intersection points at the joint, forming a clean
// miter seam. Works for ANY angle.
// ═══════════════════════════════════════════════════════════════

function computeWallPolygons(walls) {
  const TOLERANCE = 0.02;

  // For each wall, compute its 4 default corners
  // Convention: "left" = +normal side, "right" = -normal side
  // Normal = 90° CCW rotation of direction = (-dy, dx) / length
  // Polygon order: startLeft, endLeft, endRight, startRight

  const wallData = walls.map(wall => {
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return { id: wall.id, polygon: [] };

    const nx = -dy / len, ny = dx / len;
    const h = wall.thickness / 2;

    return {
      id: wall.id,
      wall,
      len,
      nx, ny,
      h,
      // Left edge line (at +normal)
      leftStart:  { x: wall.start.x + nx * h, y: wall.start.y + ny * h },
      leftEnd:    { x: wall.end.x + nx * h,   y: wall.end.y + ny * h },
      // Right edge line (at -normal)
      rightStart: { x: wall.start.x - nx * h, y: wall.start.y - ny * h },
      rightEnd:   { x: wall.end.x - nx * h,   y: wall.end.y - ny * h },
      // Mitered corners (initially = default corners, updated at joints)
      startLeft:  { x: wall.start.x + nx * h, y: wall.start.y + ny * h },
      startRight: { x: wall.start.x - nx * h, y: wall.start.y - ny * h },
      endLeft:    { x: wall.end.x + nx * h,   y: wall.end.y + ny * h },
      endRight:   { x: wall.end.x - nx * h,   y: wall.end.y - ny * h },
    };
  });

  // Find connected endpoints and compute miters
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const w1 = walls[i], w2 = walls[j];
      const d1 = wallData[i], d2 = wallData[j];
      if (!d1.len || !d2.len) continue;

      // Check all 4 endpoint combinations
      const pairs = [
        { p1: w1.end,   p2: w2.start, e1: 'end',   e2: 'start' },
        { p1: w1.end,   p2: w2.end,   e1: 'end',   e2: 'end' },
        { p1: w1.start, p2: w2.start, e1: 'start', e2: 'start' },
        { p1: w1.start, p2: w2.end,   e1: 'start', e2: 'end' },
      ];

      for (const { p1, p2, e1, e2 } of pairs) {
        if (Math.hypot(p1.x - p2.x, p1.y - p2.y) > TOLERANCE) continue;

        // These walls share an endpoint. Intersect their edge lines.
        const leftMiter = lineIntersect(
          d1.leftStart, d1.leftEnd,
          d2.leftStart, d2.leftEnd
        );
        const rightMiter = lineIntersect(
          d1.rightStart, d1.rightEnd,
          d2.rightStart, d2.rightEnd
        );

        if (!leftMiter || !rightMiter) continue;

        // Miter limit: don't extend too far for very acute angles
        const shared = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        const maxDist = Math.max(d1.h, d2.h) * 5;
        if (Math.hypot(leftMiter.x - shared.x, leftMiter.y - shared.y) > maxDist) continue;
        if (Math.hypot(rightMiter.x - shared.x, rightMiter.y - shared.y) > maxDist) continue;

        // Apply miter points to both walls
        if (e1 === 'end') {
          d1.endLeft = leftMiter;
          d1.endRight = rightMiter;
        } else {
          d1.startLeft = leftMiter;
          d1.startRight = rightMiter;
        }
        if (e2 === 'end') {
          d2.endLeft = leftMiter;
          d2.endRight = rightMiter;
        } else {
          d2.startLeft = leftMiter;
          d2.startRight = rightMiter;
        }
      }
    }
  }

  // Build final polygons
  return wallData.map(d => ({
    id: d.id,
    polygon: d.len ? [d.startLeft, d.endLeft, d.endRight, d.startRight] : [],
  }));
}

function lineIntersect(a1, a2, b1, b2) {
  const d1x = a2.x - a1.x, d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x, d2y = b2.y - b1.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-10) return null;
  const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / denom;
  return { x: a1.x + t * d1x, y: a1.y + t * d1y };
}
