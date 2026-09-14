/* ============================================================
   ШАГ 2. СЦЕНА, КАМЕРА, РЕНДЕРЕР, СВЕТ
   ============================================================
   Белая "студия" как на erik-shevchenko.com:
   - сцена: чистый белый фон
   - свет: главный источник (отбрасывает тени) + 2 заливочных
   - ACES tone mapping как в оригинале
   ============================================================ */

import * as THREE from '../vendor/three/build/three.module.js';

export function createScene(canvas) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#ffffff');

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 80);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.6;

  /* --- СВЕТ --- */
  // Общий свет — приглушённый, как "в тёмной студии" (ещё в 2 раза темнее)
  const mainLight = new THREE.PointLight(0xffffff, 22.5);
  mainLight.position.set(0, 2.25, 2.25);
  mainLight.castShadow = true;
  mainLight.shadow.mapSize.set(1024, 1024);
  mainLight.shadow.radius = 20;
  scene.add(mainLight);

  // Два заливочных источника по углам — без теней, еле-еле
  const cornerLights = [
    new THREE.PointLight(0xffffff, 1),
    new THREE.PointLight(0xffffff, 1),
  ];
  cornerLights.forEach((l) => scene.add(l));

  // Равномерная заливка (в оригинале её даёт SSGI) — тусклая
  const ambient = new THREE.AmbientLight(0xffffff, 0.08);
  scene.add(ambient);

  function resize(w, h) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  return { scene, camera, renderer, resize, cornerLights, mainLight };
}