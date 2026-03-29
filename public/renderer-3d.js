// renderer-3d.js — Three.js 3D preview renderer
// Three.js loaded from CDN in index.html, available as global THREE

export class Renderer3D {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);

    // Camera
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    this.camera.position.set(10, 12, 10);
    this.camera.lookAt(0, 0, 0);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);

    // Controls
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.target.set(0, 1.5, 0);

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambient);

    const directional = new THREE.DirectionalLight(0xffffff, 0.8);
    directional.position.set(10, 20, 10);
    directional.castShadow = true;
    this.scene.add(directional);

    // Ground plane
    const groundGeo = new THREE.PlaneGeometry(100, 100);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x2a2a3e,
      roughness: 0.9,
    });
    this.ground = new THREE.Mesh(groundGeo, groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    // Grid helper
    const grid = new THREE.GridHelper(40, 40, 0x444466, 0x333355);
    grid.position.y = 0.01;
    this.scene.add(grid);

    // Building group
    this.buildingGroup = new THREE.Group();
    this.scene.add(this.buildingGroup);

    // Materials
    this.wallMaterial = new THREE.MeshStandardMaterial({
      color: 0xe0e0e0,
      roughness: 0.7,
      metalness: 0.0,
    });
    this.doorMaterial = new THREE.MeshStandardMaterial({
      color: 0x4fc3f7,
      roughness: 0.3,
      metalness: 0.1,
      transparent: true,
      opacity: 0.6,
    });
    this.windowMaterial = new THREE.MeshStandardMaterial({
      color: 0x81c784,
      roughness: 0.1,
      metalness: 0.2,
      transparent: true,
      opacity: 0.4,
    });
    this.floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x3a3a4e,
      roughness: 0.8,
    });

    // Animation loop
    this._animate = this._animate.bind(this);
    this._animate();
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    this.camera.aspect = rect.width / rect.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(rect.width, rect.height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
  }

  _animate() {
    requestAnimationFrame(this._animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  rebuild(model) {
    // Clear existing building
    while (this.buildingGroup.children.length > 0) {
      const child = this.buildingGroup.children[0];
      this.buildingGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
    }

    for (const storey of model.storeys) {
      this._buildStorey(storey);
    }
  }

  _buildStorey(storey) {
    const elevation = storey.elevation || 0;

    // Floor slab
    if (storey.walls.length > 0) {
      let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
      for (const wall of storey.walls) {
        minX = Math.min(minX, wall.start.x, wall.end.x);
        minZ = Math.min(minZ, wall.start.y, wall.end.y);
        maxX = Math.max(maxX, wall.start.x, wall.end.x);
        maxZ = Math.max(maxZ, wall.start.y, wall.end.y);
      }
      const floorW = maxX - minX + 0.4;
      const floorD = maxZ - minZ + 0.4;
      const floorGeo = new THREE.BoxGeometry(floorW, 0.15, floorD);
      const floor = new THREE.Mesh(floorGeo, this.floorMaterial);
      floor.position.set(
        (minX + maxX) / 2,
        elevation - 0.075,
        (minZ + maxZ) / 2,
      );
      floor.receiveShadow = true;
      this.buildingGroup.add(floor);
    }

    // Walls
    for (const wall of storey.walls) {
      this._buildWall(wall, elevation);
    }
  }

  _buildWall(wall, elevation) {
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;

    const angle = Math.atan2(dy, dx);
    const cx = (wall.start.x + wall.end.x) / 2;
    const cy = (wall.start.y + wall.end.y) / 2;

    if (wall.openings.length === 0) {
      // Simple solid wall
      const geo = new THREE.BoxGeometry(len, wall.height, wall.thickness);
      const mesh = new THREE.Mesh(geo, this.wallMaterial);
      mesh.position.set(cx, elevation + wall.height / 2, cy);
      mesh.rotation.y = -angle;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.buildingGroup.add(mesh);
    } else {
      // Wall with openings — split into segments
      this._buildWallWithOpenings(wall, elevation, len, angle);
    }
  }

  _buildWallWithOpenings(wall, elevation, wallLen, angle) {
    // Sort openings by position
    const openings = [...wall.openings].sort((a, b) => a.position - b.position);

    // Build wall segments around openings
    const segments = [];
    let cursor = 0;

    for (const opening of openings) {
      const openStart = opening.position - opening.width / 2;
      const openEnd = opening.position + opening.width / 2;

      // Wall segment before this opening
      if (openStart > cursor + 0.01) {
        segments.push({ type: 'wall', start: cursor, end: openStart, height: wall.height, bottomY: 0 });
      }

      // Below opening (sill for windows)
      if (opening.sillHeight > 0.01) {
        segments.push({ type: 'wall', start: openStart, end: openEnd, height: opening.sillHeight, bottomY: 0 });
      }

      // Above opening
      const topOfOpening = opening.sillHeight + opening.height;
      if (topOfOpening < wall.height - 0.01) {
        segments.push({ type: 'wall', start: openStart, end: openEnd, height: wall.height - topOfOpening, bottomY: topOfOpening });
      }

      // The opening itself (door or window pane)
      segments.push({
        type: opening.type,
        start: openStart,
        end: openEnd,
        height: opening.height,
        bottomY: opening.sillHeight,
      });

      cursor = openEnd;
    }

    // Wall segment after last opening
    if (cursor < wallLen - 0.01) {
      segments.push({ type: 'wall', start: cursor, end: wallLen, height: wall.height, bottomY: 0 });
    }

    // Create meshes for each segment
    const dirX = (wall.end.x - wall.start.x) / wallLen;
    const dirY = (wall.end.y - wall.start.y) / wallLen;

    for (const seg of segments) {
      const segLen = seg.end - seg.start;
      const segCenter = (seg.start + seg.end) / 2;

      const px = wall.start.x + dirX * segCenter;
      const pz = wall.start.y + dirY * segCenter;
      const py = elevation + seg.bottomY + seg.height / 2;

      let material;
      if (seg.type === 'wall') material = this.wallMaterial;
      else if (seg.type === 'door') material = this.doorMaterial;
      else material = this.windowMaterial;

      const geo = new THREE.BoxGeometry(segLen, seg.height, wall.thickness);
      const mesh = new THREE.Mesh(geo, material);
      mesh.position.set(px, py, pz);
      mesh.rotation.y = -angle;
      mesh.castShadow = seg.type === 'wall';
      mesh.receiveShadow = true;
      this.buildingGroup.add(mesh);
    }
  }

  centerOn(model) {
    const storey = model.storeys.find((s) => s.id === model.activeStorey) || model.storeys[0];
    if (!storey || storey.walls.length === 0) {
      this.controls.target.set(0, 1.5, 0);
      this.camera.position.set(10, 12, 10);
      return;
    }

    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const wall of storey.walls) {
      minX = Math.min(minX, wall.start.x, wall.end.x);
      minZ = Math.min(minZ, wall.start.y, wall.end.y);
      maxX = Math.max(maxX, wall.start.x, wall.end.x);
      maxZ = Math.max(maxZ, wall.start.y, wall.end.y);
    }

    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const span = Math.max(maxX - minX, maxZ - minZ, 4);

    this.controls.target.set(cx, storey.height / 2, cz);
    this.camera.position.set(cx + span, span * 1.2, cz + span);
  }
}
