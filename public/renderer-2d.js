// renderer-2d.js — Canvas 2D floorplan renderer

const GRID_SIZE = 1; // 1 meter grid
const COLORS = {
  bg: '#1a1a2e',
  grid: '#16213e',
  gridMajor: '#1a3a5c',
  wall: '#e0e0e0',
  wallStroke: '#ffffff',
  door: '#4fc3f7',
  doorArc: 'rgba(79, 195, 247, 0.3)',
  window: '#81c784',
  windowGlass: 'rgba(129, 199, 132, 0.4)',
  text: '#aaaaaa',
  selection: '#ff9800',
  dimension: '#888888',
};

export class Renderer2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scale = 40; // pixels per meter
    this.offsetX = 0;
    this.offsetY = 0;
    this.selectedId = null;

    // Pan & zoom
    this._dragging = false;
    this._lastMouse = { x: 0, y: 0 };

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      // Zoom towards mouse
      this.offsetX = mx - (mx - this.offsetX) * zoomFactor;
      this.offsetY = my - (my - this.offsetY) * zoomFactor;
      this.scale *= zoomFactor;
      this._needsRender = true;
    });

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 1 || e.button === 0 && e.shiftKey) {
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
        this._needsRender = true;
      }
    });

    canvas.addEventListener('mouseup', () => {
      this._dragging = false;
      canvas.style.cursor = 'default';
    });

    canvas.addEventListener('mouseleave', () => {
      this._dragging = false;
      canvas.style.cursor = 'default';
    });

    this._needsRender = true;
  }

  // Convert model coordinates to screen
  toScreen(x, y) {
    return {
      x: x * this.scale + this.offsetX,
      y: y * this.scale + this.offsetY,
    };
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._needsRender = true;
  }

  centerOn(model) {
    const storey = model.storeys.find((s) => s.id === model.activeStorey) || model.storeys[0];
    if (!storey || storey.walls.length === 0) {
      // Center on origin
      const w = this.canvas.width / (window.devicePixelRatio || 1);
      const h = this.canvas.height / (window.devicePixelRatio || 1);
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
    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);
    const spanX = maxX - minX + 4;
    const spanY = maxY - minY + 4;
    this.scale = Math.min(w / spanX, h / spanY, 80);
    this.offsetX = w / 2 - cx * this.scale;
    this.offsetY = h / 2 - cy * this.scale;
  }

  render(model) {
    const ctx = this.ctx;
    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);

    // Background
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);

    // Grid
    this._drawGrid(w, h);

    const storey = model.storeys.find((s) => s.id === model.activeStorey) || model.storeys[0];
    if (!storey) return;

    // Draw walls
    for (const wall of storey.walls) {
      this._drawWall(wall);
    }

    // Labels
    ctx.fillStyle = COLORS.text;
    ctx.font = '12px monospace';
    ctx.fillText(`${storey.name} | ${model.name}`, 10, h - 10);

    // Scale indicator
    this._drawScaleBar(w, h);
  }

  _drawGrid(w, h) {
    const ctx = this.ctx;
    const step = GRID_SIZE * this.scale;
    if (step < 5) return; // Too zoomed out

    const startX = this.offsetX % step;
    const startY = this.offsetY % step;
    const majorEvery = 5;

    ctx.lineWidth = 0.5;
    for (let x = startX; x < w; x += step) {
      const worldX = Math.round((x - this.offsetX) / this.scale);
      ctx.strokeStyle = worldX % majorEvery === 0 ? COLORS.gridMajor : COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = startY; y < h; y += step) {
      const worldY = Math.round((y - this.offsetY) / this.scale);
      ctx.strokeStyle = worldY % majorEvery === 0 ? COLORS.gridMajor : COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  }

  _drawWall(wall) {
    const ctx = this.ctx;
    const s = this.toScreen(wall.start.x, wall.start.y);
    const e = this.toScreen(wall.end.x, wall.end.y);
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;

    const nx = -dy / len; // normal
    const ny = dx / len;
    const halfT = (wall.thickness / 2) * this.scale;

    const isSelected = wall.id === this.selectedId;

    // Wall polygon (thick line)
    ctx.fillStyle = isSelected ? COLORS.selection : COLORS.wall;
    ctx.strokeStyle = COLORS.wallStroke;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(s.x + nx * halfT, s.y + ny * halfT);
    ctx.lineTo(e.x + nx * halfT, e.y + ny * halfT);
    ctx.lineTo(e.x - nx * halfT, e.y - ny * halfT);
    ctx.lineTo(s.x - nx * halfT, s.y - ny * halfT);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Draw openings
    for (const opening of wall.openings) {
      this._drawOpening(wall, opening, s, e, len, nx, ny);
    }

    // Dimension label
    ctx.fillStyle = COLORS.dimension;
    ctx.font = '10px monospace';
    const mx = (s.x + e.x) / 2;
    const my = (s.y + e.y) / 2;
    ctx.fillText(`${len.toFixed(1)}m`, mx + nx * halfT + 4, my + ny * halfT + 4);
  }

  _drawOpening(wall, opening, screenStart, screenEnd, wallLen, nx, ny) {
    const ctx = this.ctx;
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const t = opening.position / wallLen;
    const halfW = (opening.width / 2) / wallLen;

    const t1 = t - halfW;
    const t2 = t + halfW;

    const p1 = this.toScreen(
      wall.start.x + dx * t1,
      wall.start.y + dy * t1,
    );
    const p2 = this.toScreen(
      wall.start.x + dx * t2,
      wall.start.y + dy * t2,
    );

    const halfT = (wall.thickness / 2) * this.scale;
    const isSelected = opening.id === this.selectedId;

    // Clear the wall section where the opening is
    ctx.fillStyle = COLORS.bg;
    ctx.beginPath();
    ctx.moveTo(p1.x + nx * (halfT + 1), p1.y + ny * (halfT + 1));
    ctx.lineTo(p2.x + nx * (halfT + 1), p2.y + ny * (halfT + 1));
    ctx.lineTo(p2.x - nx * (halfT + 1), p2.y - ny * (halfT + 1));
    ctx.lineTo(p1.x - nx * (halfT + 1), p1.y - ny * (halfT + 1));
    ctx.closePath();
    ctx.fill();

    if (opening.type === 'door') {
      // Door: draw swing arc
      const color = isSelected ? COLORS.selection : COLORS.door;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;

      // Door leaf line
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p1.x + nx * opening.width * this.scale, p1.y + ny * opening.width * this.scale);
      ctx.stroke();

      // Arc
      ctx.fillStyle = isSelected ? 'rgba(255,152,0,0.15)' : COLORS.doorArc;
      ctx.beginPath();
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      const arcAngle = Math.atan2(ny, nx);
      ctx.arc(p1.x, p1.y, opening.width * this.scale, arcAngle, angle, false);
      ctx.lineTo(p1.x, p1.y);
      ctx.fill();
      ctx.stroke();

      // Threshold lines
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(p1.x + nx * halfT, p1.y + ny * halfT);
      ctx.lineTo(p1.x - nx * halfT, p1.y - ny * halfT);
      ctx.moveTo(p2.x + nx * halfT, p2.y + ny * halfT);
      ctx.lineTo(p2.x - nx * halfT, p2.y - ny * halfT);
      ctx.stroke();
    } else {
      // Window: parallel lines
      const color = isSelected ? COLORS.selection : COLORS.window;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;

      // Three parallel lines across the opening
      for (const offset of [-0.3, 0, 0.3]) {
        const ox = nx * halfT * offset;
        const oy = ny * halfT * offset;
        ctx.beginPath();
        ctx.moveTo(p1.x + ox, p1.y + oy);
        ctx.lineTo(p2.x + ox, p2.y + oy);
        ctx.stroke();
      }

      // Glass fill
      ctx.fillStyle = isSelected ? 'rgba(255,152,0,0.15)' : COLORS.windowGlass;
      ctx.fillRect(
        Math.min(p1.x, p2.x) - Math.abs(nx * halfT * 0.3),
        Math.min(p1.y, p2.y) - Math.abs(ny * halfT * 0.3),
        Math.abs(p2.x - p1.x) + Math.abs(nx * halfT * 0.6) || Math.abs(nx * halfT * 0.6),
        Math.abs(p2.y - p1.y) + Math.abs(ny * halfT * 0.6) || Math.abs(ny * halfT * 0.6),
      );

      // Sill lines
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(p1.x + nx * halfT, p1.y + ny * halfT);
      ctx.lineTo(p1.x - nx * halfT, p1.y - ny * halfT);
      ctx.moveTo(p2.x + nx * halfT, p2.y + ny * halfT);
      ctx.lineTo(p2.x - nx * halfT, p2.y - ny * halfT);
      ctx.stroke();
    }
  }

  _drawScaleBar(w, h) {
    const ctx = this.ctx;
    const barLen = this.scale; // 1 meter in pixels
    const x = w - barLen - 20;
    const y = h - 25;

    ctx.strokeStyle = COLORS.text;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + barLen, y);
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x, y + 4);
    ctx.moveTo(x + barLen, y - 4);
    ctx.lineTo(x + barLen, y + 4);
    ctx.stroke();

    ctx.fillStyle = COLORS.text;
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('1m', x + barLen / 2, y - 6);
    ctx.textAlign = 'left';
  }
}
