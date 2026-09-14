/* ============================================================
   Поле: белая комната с шарами, как в шапке erik-shevchenko.com
   ============================================================
   Скопировано поведение оригинала (адаптировано под WebGL вместо WebGPU):
   - "комната"-коробка из пяти белых стен с мягкими тенями
   - сотни белых матовых шаров трёх размеров
   - гравитация тянет шары к передней "витрине" (z = frontZ)
   - курсор расталкивает шары, клик разбрасывает с силой
   - один синий "пет"-шар мягко следует за курсором
   ============================================================ */

import * as THREE from '../vendor/three/build/three.module.js';

const H = 4.5;          // высота комнаты
const D = 2.25;         // глубина комнаты
const frontZ = 2.25;    // передняя граница (невидимая "витрина")
const backZ = frontZ - D;
const centerZ = (frontZ + backZ) / 2;

// Базовый радиус шара (как в оригинале); в resize шары получают 3 размера
const radius = 0.32 / 1.5 / 1.5 * 0.7 * 1.3;

export function makeField(scene, options = {}) {
  const sign = options.sign || 'ГТО';
  // --- Зернистая "шероховатая" текстура (шум в духе SSGI у оригинала) ---
  function makeGrainTexture(size = 256) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const tile = 2;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += tile) {
      for (let x = 0; x < size; x += tile) {
        const v = 60 + (Math.random() < 0.5 ? -Math.floor(Math.random() * 180) : Math.floor(Math.random() * 120));
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(x, y, tile, tile);
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(24, 24);
    tex.anisotropy = 4;
    return tex;
  }
  const grainTexture = makeGrainTexture();

  // --- Комната (группа стен) ---
  const room = new THREE.Group();
  scene.add(room);

  const wallGeo = new THREE.BoxGeometry(1, 1, 1);
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.98,
    bumpMap: grainTexture,
    bumpScale: 0.36,
    roughnessMap: grainTexture,
  });
  const walls = Array.from({ length: 5 }, () => {
    const m = new THREE.Mesh(wallGeo, wallMaterial);
    m.receiveShadow = true;
    room.add(m);
    return m;
  });
  const backWallMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.95,
    bumpScale: 0.35,
    emissive: 0xffffff,
    emissiveIntensity: 18,
  });

  // --- Геометрия и материалы шаров ---
  const ballGeo = new THREE.SphereGeometry(1, 24, 16);
  const ballMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0, bumpMap: grainTexture, bumpScale: 0.7, roughnessMap: grainTexture });
  const glowMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2.6, roughness: 0.15, metalness: 0, bumpMap: grainTexture, bumpScale: 0.24 });
  // Голубой "пет"-шар — гладкий, без зерна (иначе при масштабировании появляются белые артефакты)
  const blueGeo = new THREE.SphereGeometry(1, 64, 48);
  const blueMaterial = new THREE.MeshStandardMaterial({ color: 0x003cff, emissive: 0x003cff, emissiveIntensity: 1.4, roughness: 0.15, metalness: 0 });

  // Синий "пет"-шар — отдельным мешем
  const blueMesh = new THREE.Mesh(blueGeo, blueMaterial);
  blueMesh.frustumCulled = false;
  scene.add(blueMesh);

  let W = 10;
  let balls = [];
  let mesh, glowMesh;
  let glowIndices = [];

  const dummy = new THREE.Object3D();
  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const closest = new THREE.Vector3();
  const axes = ['x', 'y', 'z'];

  let pointerUntil = 0;
  let attractionUntil = 0;
  let blueHovered = false;

  // Светящиеся шары — пять (как в оригинале)
  const glowLights = Array.from({ length: 5 }, () => {
    const l = new THREE.PointLight(0xffffff, 0.33, 2, 2);
    l.castShadow = false;
    scene.add(l);
    return l;
  });
  // Синяя лампа у синего шара (свет уменьшен): 8 → 2.7 → 1.35 → 0.45 → 0.225
  const blueLight = new THREE.PointLight(0x003cff, 0.225, 2, 2);
  blueLight.castShadow = false;
  scene.add(blueLight);

  // Свет курсора — одна белая лампа (очень слабая)
  const cursorLight = new THREE.PointLight(0xffffff, 1.5, 8, 1.5);
  cursorLight.castShadow = false;
  scene.add(cursorLight);

  // Неоновый свет от букв ГТО — яркий белый, заметный на стене вокруг букв
  const neonLight = new THREE.PointLight(0xffffff, 12, 7, 2);
  neonLight.castShadow = false;
  scene.add(neonLight);

  /* ---------------- ОТРИСОВКА ---------------- */
  let currentBlueScale = 1;
  let hoverLast = performance.now();
  let spinY = 0, spinPitch = 0;
  function draw() {
    const dt = Math.min((performance.now() - hoverLast) / 1000, 1 / 15);
    hoverLast = performance.now();
    balls.forEach((b, i) => {
      dummy.position.copy(b.p);
      dummy.scale.setScalar(b.radius);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    glowIndices.forEach((ballIndex, slot) => {
      const b = balls[ballIndex];
      dummy.position.copy(b.p);
      dummy.scale.setScalar(b.radius);
      dummy.updateMatrix();
      glowMesh.setMatrixAt(slot, dummy.matrix);
      glowLights[slot].position.copy(b.p);
    });
    const blue = balls[blueIndex];
    const targetScale = blue.radius * (blueHovered ? 3 : 1);
    const blend = 1 - Math.exp(-10 * dt);
    currentBlueScale += (targetScale - currentBlueScale) * blend;
    blueMesh.scale.setScalar(currentBlueScale);
    blueMesh.position.copy(blue.p);
    blueLight.position.copy(blue.p);
    if (blueHovered) {
      spinY += dt * 6;
      spinPitch += dt * 3;
    }
    blueMesh.rotation.y = spinY;
    blueMesh.rotation.x = spinPitch;
    mesh.instanceMatrix.needsUpdate = true;
    glowMesh.instanceMatrix.needsUpdate = true;
  }

  /* ---------------- ФИЗИКА ---------------- */
  // Пространственная грид-сетка для быстрых столкновений (как в оригинале)
  let contactGrid = new Int32Array(0), contactNext = new Int32Array(0);
  let gridX = 0, gridY = 0, gridZ = 0, gridOffsetX = 0;

  function resizeContactGrid(count) {
    const diameter = radius * 2;
    gridOffsetX = Math.ceil(W / 2 / diameter) + 3;
    gridX = gridOffsetX * 2 + 1;
    gridY = Math.ceil(H / diameter) + 7;
    gridZ = Math.ceil(frontZ / diameter) + 7;
    contactGrid = new Int32Array(1 + gridX * gridY * gridZ);
    contactNext = new Int32Array(count);
  }
  const cellKey = (x, y, z) => {
    x += gridOffsetX; y += 3; z += 3;
    return (x < 0 || y < 0 || z < 0 || x >= gridX || y >= gridY || z >= gridZ)
      ? 0 : 1 + x + gridX * (y + gridY * z);
  };

  function step(dt, interact = true) {
    const pointerActive = interact && performance.now() < pointerUntil;
    const drag = Math.exp(-0.3 * dt);

    // Свет курсора мягко тянется за точкой наведения
    if (interact && performance.now() < pointerUntil) {
      cursorLight.position.lerp(cursorTarget, 1 - Math.exp(-9 * dt));
      cursorLight.intensity = Math.min(3, cursorLight.intensity + 2 * dt * 8);
    } else {
      cursorLight.intensity = Math.max(0, cursorLight.intensity - 6 * dt * 12);
    }

    for (const b of balls) {
      // Гравитация к передней "витрине" (в 2 раза слабее — шары медленнее)
      b.v.z += 2.45 * dt;

      // Синий шар мягко следует за курсором
      if (b === balls[blueIndex] && interact && performance.now() < attractionUntil) {
        const t = (b.p.z - ray.ray.origin.z) / ray.ray.direction.z;
        const dx = ray.ray.origin.x + ray.ray.direction.x * t - b.p.x;
        const dy = ray.ray.origin.y + ray.ray.direction.y * t - b.p.y;
        const distance = Math.hypot(dx, dy), reach = 2;
        if (distance < reach) {
          const speed = Math.min(0.1625, distance) * (1 - distance / reach);
          const blend = 1 - Math.exp(-5 * dt);
          b.v.x += ((dx / (distance || 1)) * speed - b.v.x) * blend;
          b.v.y += ((dy / (distance || 1)) * speed - b.v.y) * blend;
        }
      }

      // Остальные шары отталкивает луч курсора
      if (pointerActive && b !== balls[blueIndex]) {
        ray.ray.closestPointToPoint(b.p, closest);
        const dx = b.p.x - closest.x, dy = b.p.y - closest.y, dz = b.p.z - closest.z;
        const d = Math.hypot(dx, dy, dz);
        if (d < 1.2) {
          const force = (1 - d / 1.2) * dt * 48 / (d || 1);
          b.v.x += dx * force;
          b.v.y += Math.max(0.35, dy) * force;
          b.v.z += dz * force;
        }
      }

      b.v.multiplyScalar(drag);
      b.p.addScaledVector(b.v, dt);
    }

    // Столкновения через грид-сетку (несколько итераций для стабильности)
    for (let iteration = 0; iteration < 6; iteration++) {
      contactGrid.fill(-1);
      for (let i = 0; i < balls.length; i++) {
        const p = balls[i].p;
        const key = cellKey(Math.floor(p.x / (radius * 2)), Math.floor(p.y / (radius * 2)), Math.floor(p.z / (radius * 2)));
        contactNext[i] = contactGrid[key];
        contactGrid[key] = i;
      }
      for (let i = 0; i < balls.length; i++) {
        const p = balls[i].p;
        const cx = Math.floor(p.x / (radius * 2));
        const cy = Math.floor(p.y / (radius * 2));
        const cz = Math.floor(p.z / (radius * 2));
        for (let x = cx - 1; x <= cx + 1; x++)
          for (let y = cy - 1; y <= cy + 1; y++)
            for (let z = cz - 1; z <= cz + 1; z++) {
              for (let j = contactGrid[cellKey(x, y, z)]; j !== -1; j = contactNext[j]) {
                if (j <= i) continue;
                const a = balls[i], b = balls[j];
                const dx = b.p.x - a.p.x, dy = b.p.y - a.p.y, dz = b.p.z - a.p.z;
                const contact = a.radius + b.radius;
                const d2 = dx * dx + dy * dy + dz * dz;
                if (d2 >= contact * contact || d2 < 1e-12) continue;
                const d = Math.sqrt(d2);
                const nx = dx / d, ny = dy / d, nz = dz / d;
                const c = (contact - d) * 0.5;
                a.p.x -= nx * c; a.p.y -= ny * c; a.p.z -= nz * c;
                b.p.x += nx * c; b.p.y += ny * c; b.p.z += nz * c;
                const relV = (b.v.x - a.v.x) * nx + (b.v.y - a.v.y) * ny + (b.v.z - a.v.z) * nz;
                if (relV < 0) {
                  const impulse = -relV * (Math.abs(relV) > 1 ? 1.32 : 1) * 0.5;
                  a.v.x -= nx * impulse; a.v.y -= ny * impulse; a.v.z -= nz * impulse;
                  b.v.x += nx * impulse; b.v.y += ny * impulse; b.v.z += nz * impulse;
                }
              }
            }
      }
      // Стенки комнаты
      for (const b of balls) {
        for (const axis of axes) {
          const lo = (axis === 'x' ? -W / 2 : axis === 'z' ? backZ : 0) + b.radius;
          const hi = (axis === 'x' ? W / 2 : axis === 'z' ? frontZ : H) - b.radius;
          if (b.p[axis] < lo) { b.p[axis] = lo; if (b.v[axis] < 0) b.v[axis] *= Math.abs(b.v[axis]) > 0.6 ? -0.35 : 0; }
          if (b.p[axis] > hi) { b.p[axis] = hi; if (b.v[axis] > 0) b.v[axis] *= -0.35; }
        }
      }
    }
  }

  /* ---------------- ИНИЦИАЛИЗАЦИЯ / RESIZE ---------------- */
  let layoutWidth = 0, layoutHeight = 0;

  function resize(w, h, camera) {
    if (!w || !h || (w === layoutWidth && h === layoutHeight)) return;
    const previousW = W;
    layoutWidth = w; layoutHeight = h;

    W = H * w / h;
    camera.aspect = w / h;
    camera.position.set(0, H / 2, H / 2 / Math.tan(Math.PI / 8) + frontZ);
    camera.lookAt(0, H / 2, 0);
    camera.updateProjectionMatrix();

    cornerLightsRef.forEach((cl, i) => cl.position.set((i ? 1 : -1) * (W / 2 - 0.25), H - 0.25, frontZ + 0.15));

    // Неоновый свет у задней стены — в центре букв ГТО, падает на стену
    neonLight.position.set(0, H / 2, -D / 2 - 0.06 + 0.05);

    // Пять стен комнаты.
    // Боковые стены остаются на границе движения шаров (±W/2) — их видно.
    // Пол/потолок и заднюю стену растягиваем шире и глубже кадра,
    // чтобы их внешние кромки не просматривались (они уходят за фрустум).
    const wide = 1.8, deep = 3;
    const specs = [
      [[W * wide, 0.12, D * deep], [0, -0.06, 0]],
      [[W * wide, 0.12, D * deep], [0, H + 0.06, 0]],
      [[W * wide, H * wide, 0.12], [0, H / 2, -D / 2 - 0.06]],
      [[0.12, H * wide, D * deep], [-W / 2, H / 2, 0]],
      [[0.12, H * wide, D * deep], [ W / 2, H / 2, 0]],
    ];
    specs.forEach(([s, p], i) => {
      walls[i].scale.set(s[0], s[1], s[2]);
      walls[i].position.set(p[0], p[1], p[2]);
    });

    // Задняя стена (индекс 2) — получает bump-текстуру с буквами sign
    if (!walls[2].material || walls[2].material === wallMaterial) {
      walls[2].material = backWallMaterial;
    }
    {
      const aspect = W / H;
      const cw = 2048, ch = Math.round(cw / aspect);
      const fontFamily = '"TT Squares", "TTSquares", "Bebas Neue", "Arial Black", Impact, sans-serif';
      // По умолчанию размер как в оригинале («ГТО»). Если задан options.signWidth
      // (доля ширины комнаты), подгоняем шрифт так, чтобы надпись занимала
      // ровно эту долю: задняя стена в 1.8 раза шире комнаты, поэтому
      // 1 px текстуры = (1.8·W)/2048 мировых единиц, ширина комнаты — W.
      let fs;
      if (options.signWidth !== undefined) {
        const targetW = cw * (options.signWidth / 1.8);
        fs = Math.round(ch * 0.45);
        const probe = document.createElement('canvas').getContext('2d');
        probe.font = `900 ${fs}px ${fontFamily}`;
        probe.lineJoin = 'round';
        probe.lineCap = 'round';
        probe.lineWidth = Math.max(9, fs * 0.135);
        const w = probe.measureText(sign).width
          + Math.round(fs * 0.14) * (sign.length - 1)
          + Math.max(9, fs * 0.135);
        fs = Math.max(12, Math.round(fs * (targetW / w)));
      } else {
        fs = Math.round(ch * 0.32);
      }
      const textFont = `900 ${fs}px ${fontFamily}`;
      const ls = `${Math.round(fs * 0.14)}px`;

      const letterStroke = (ctx, width) => {
        ctx.font = textFont;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.letterSpacing = ls;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.lineWidth = width;
        ctx.strokeText(sign, cw / 2, ch / 2);
      };

      // Цветная карта: чисто белая стена, букв в цвете нет
      const c = document.createElement('canvas');
      c.width = cw; c.height = ch;
      const g = c.getContext('2d');
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, cw, ch);
      const tex = new THREE.CanvasTexture(c);
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;

      // Emissive: двойная неоновая трубка (как китайские вывески)
      const ec = document.createElement('canvas');
      ec.width = cw; ec.height = ch;
      const eg = ec.getContext('2d');
      eg.fillStyle = '#000000';
      eg.fillRect(0, 0, cw, ch);
      eg.lineJoin = 'round';
      eg.lineCap = 'round';
      eg.font = textFont;
      eg.textAlign = 'center';
      eg.textBaseline = 'middle';
      eg.letterSpacing = ls;
      // Мягкий ореол вокруг обеих трубок
      letterStroke(eg, Math.max(9, fs * 0.135));
      eg.globalAlpha = 0.35;
      eg.strokeStyle = '#ffffff';
      eg.stroke();
      eg.globalAlpha = 1;
      // Внешняя трубка — толстая, яркая
      letterStroke(eg, Math.max(4.5, fs * 0.045));
      eg.strokeStyle = '#ffffff';
      eg.stroke();
      // Промежуток между трубками (чёрный — пропуск света)
      letterStroke(eg, Math.max(2.4, fs * 0.024));
      eg.strokeStyle = '#000000';
      eg.stroke();
      // Внутренняя трубка — тонкая, яркая
      letterStroke(eg, Math.max(1.5, fs * 0.015));
      eg.strokeStyle = '#ffffff';
      eg.stroke();
      const eTex = new THREE.CanvasTexture(ec);
      eTex.wrapS = eTex.wrapT = THREE.ClampToEdgeWrapping;
      eTex.colorSpace = THREE.SRGBColorSpace;

      // Bump: выпуклые двойные трубки (два гребня)
      const bc = document.createElement('canvas');
      bc.width = cw; bc.height = ch;
      const bgc = bc.getContext('2d');
      bgc.fillStyle = '#000000';
      bgc.fillRect(0, 0, cw, ch);
      // Плавный подъём от стены
      letterStroke(bgc, Math.max(12, fs * 0.114));
      bgc.strokeStyle = '#4a4a4a';
      bgc.stroke();
      // Внешний гребень
      letterStroke(bgc, Math.max(4.5, fs * 0.045));
      bgc.strokeStyle = '#e0e0e0';
      bgc.stroke();
      // Промежуток
      letterStroke(bgc, Math.max(2.4, fs * 0.024));
      bgc.strokeStyle = '#000000';
      bgc.stroke();
      // Внутренний гребень
      letterStroke(bgc, Math.max(1.5, fs * 0.015));
      bgc.strokeStyle = '#ffffff';
      bgc.stroke();
      const bumpTex = new THREE.CanvasTexture(bc);
      bumpTex.wrapS = bumpTex.wrapT = THREE.ClampToEdgeWrapping;

      if (backWallMaterial.map) backWallMaterial.map.dispose();
      if (backWallMaterial.bumpMap) backWallMaterial.bumpMap.dispose();
      if (backWallMaterial.emissiveMap) backWallMaterial.emissiveMap.dispose();
      backWallMaterial.map = tex;
      backWallMaterial.bumpMap = bumpTex;
      backWallMaterial.emissiveMap = eTex;
      backWallMaterial.needsUpdate = true;
    }

    // Количество шаров ~ под ширину комнаты (как в оригинале)
    const count = 4 * Math.min(330, Math.max(48, Math.floor(W * 21)));
    resizeContactGrid(count);
    balls.forEach((b) => { b.p.x = THREE.MathUtils.clamp(b.p.x * W / previousW, -W / 2 + b.radius, W / 2 - b.radius); });
    balls.length = Math.min(balls.length, count);
    while (balls.length < count) {
      const r = radius * [1, 0.7, 0.4][balls.length % 3];
      balls.push({
        radius: r,
        p: new THREE.Vector3(
          (Math.random() - 0.5) * (W - 2 * r),
          r + Math.random() * 2.5,
          centerZ + (Math.random() - 0.5) * (D - 2 * r)
        ),
        v: new THREE.Vector3((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5),
      });
    }

    // Пересоздаём меши при изменении количества
    if (!mesh || mesh.count !== count) {
      if (mesh) { scene.remove(mesh); mesh.dispose(); }
      if (glowMesh) { scene.remove(glowMesh); glowMesh.dispose(); }
      const candidates = balls.map((_, index) => index);
      for (let index = 0; index < candidates.length; index++) {
        const target = index + Math.floor(Math.random() * (candidates.length - index));
        [candidates[index], candidates[target]] = [candidates[target], candidates[index]];
      }
      const glowCount = 5;
      glowIndices = candidates.slice(0, glowCount);
      mesh = new THREE.InstancedMesh(ballGeo, ballMaterial, count);
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(mesh);
      glowMesh = new THREE.InstancedMesh(ballGeo, glowMaterial, glowCount);
      glowMesh.frustumCulled = false;
      glowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(glowMesh);
      if (glowLights.length > glowCount) glowLights.length = glowCount;

      // Привязываем индекс синего шара
      blueIndex = glowIndices[0];
      const blue = balls[blueIndex];
      blue.radius = radius;
      blue.p.z = frontZ - blue.radius;
    }

    for (let i = 0; i < 50; i++) step(1 / 120, false);
    draw();
  }

  /* ---------------- ВВОД ---------------- */
  let cameraRef;
  let cornerLightsRef = [];
  function bindCamera(camera) { cameraRef = camera; }
  function bindCornerLights(arr) { cornerLightsRef = arr; }
  let blueIndex = 0;

  function setPointer(x, y) {
    pointer.set(x, y);
    ray.setFromCamera(pointer, cameraRef);
    ray.ray.intersectPlane(pointerPlane, rayTarget);
    cursorTarget.copy(rayTarget);
    pointerUntil = performance.now() + 90;
    attractionUntil = Infinity;
    blueHovered = ray.intersectObject(blueMesh).length > 0;
  }
  const pointerPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -frontZ);
  const rayTarget = new THREE.Vector3();
  const cursorTarget = new THREE.Vector3();
  function clearPointer() {
    pointerUntil = 0;
    attractionUntil = 0;
    blueHovered = false;
  }

  /* ---------------- ВЗРЫВ ПО КЛИКУ ---------------- */
  function burst() {
    for (const b of balls) {
      if (b === balls[blueIndex]) continue;
      ray.ray.closestPointToPoint(b.p, closest);
      const dx = b.p.x - closest.x, dy = b.p.y - closest.y, dz = b.p.z - closest.z;
      const d = Math.hypot(dx, dy, dz);
      if (d >= 1.6) continue;
      const lift = -Math.max(0.5, Math.abs(dz));
      const length = Math.hypot(dx, dy, lift);
      const impulse = 2 * (1 - d / 1.6);
      b.v.x += dx / length * impulse;
      b.v.y += dy / length * impulse;
      b.v.z += lift / length * impulse;
      b.v.clampLength(0, 4);
    }
  }

  function hitTestBlueBall(ndcX, ndcY, camera) {
    pointer.set(ndcX, ndcY);
    ray.setFromCamera(pointer, camera);
    return ray.intersectObject(blueMesh).length > 0;
  }

  return {
    stepField: step,
    drawField: draw,
    resize,
    setPointer,
    clearPointer,
    bindCamera,
    bindCornerLights,
    burst,
    hitTestBlueBall,
  };
}