/* ============================================================
   ГЛАВНЫЙ ФАЙЛ ПРОЕКТА
   ============================================================
   Путь выполнения программы: main.js
     → setup.js   (сцена, камера, рендерер, свет)
     → field.js   (создание шаров, физика)
     → input.js   (реакция на мышь)
     → loop.js    (бесконечный цикл отрисовки)
   ============================================================ */

// Импортируем три.js и наши модули-шаги
import * as THREE from '../vendor/three/build/three.module.js';
import { createScene } from './setup.js';
import { makeField } from './field.js';
import { setupInput } from './input.js';
import './loop.js'; // запускает игровой цикл (см. loop.js)

// Находим на странице канвас и контейнер hero
const canvas = document.querySelector('.hero-canvas');
const hero = document.querySelector('.hero');

// Конфигурация страницы (задаётся в HTML через <script>window.HERO_CONFIG=...;).
// Позволяет одной и той же сцене быть разными страницами:
//   sign        — текст на задней стене (напр. 'ГТО' или 'GRAND')
//   blueBallLink — куда ведёт клик по голубому шару
const config = window.HERO_CONFIG || {};

/* ------------------------------------------------------------------
   ИНИЦИАЛИЗАЦИЯ
   ------------------------------------------------------------------ */
// Создаём сцену, камеру, рендерер и свет (см. setup.js)
const { scene, camera, renderer, resize, cornerLights } = createScene(canvas);

// Создаём "поле" — набор шаров и их физику (см. field.js)
const field = makeField(scene, config);
field.bindCamera(camera);
field.bindCornerLights(cornerLights);

// Настраиваем реакцию на мышь (см. input.js)
setupInput(hero, camera, field, config);

/* ------------------------------------------------------------------
   АДАПТИВНОСТЬ (изменение размера окна)
   ------------------------------------------------------------------ */
// Когда окно меняет размер, пересчитываем размеры рендерера
// и размеры комнаты так, чтобы пропорции сохранялись.
function onResize() {
  resize(hero.clientWidth, hero.clientHeight);
  field.resize(hero.clientWidth, hero.clientHeight, camera);
}
window.addEventListener('resize', onResize);

/* ------------------------------------------------------------------
   ПЕРВЫЙ ЗАПУСК
   ------------------------------------------------------------------ */
onResize();

// Кинематографическое зерно: маленький шумный тайл,
// перерисовываемый в паттерне каждый кадр по requestAnimationFrame.
const grainCanvas = document.querySelector('.hero-grain');
let grainPattern, grainCtx, grainScale = 1;
function setupGrain() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  grainCanvas.width = Math.round(hero.clientWidth * dpr);
  grainCanvas.height = Math.round(hero.clientHeight * dpr);
  grainScale = dpr;
  grainCtx = grainCanvas.getContext('2d');
  grainPattern = null;
}
function tickGrain() {
    const tile = 64;
  const t = document.createElement('canvas');
  t.width = t.height = tile;
  const tg = t.getContext('2d');
  for (let y = 0; y < tile; y += 1) {
    for (let x = 0; x < tile; x += 1) {
      const v = Math.floor(Math.random() * 256);
      tg.fillStyle = `rgb(${v},${v},${v})`;
      tg.fillRect(x, y, 1, 1);
    }
  }
  if (!grainPattern) grainPattern = grainCtx.createPattern(t, 'repeat');
  grainCtx.imageSmoothingEnabled = false;
  grainCtx.save();
  grainCtx.scale(grainScale, grainScale);
  grainCtx.fillStyle = grainPattern;
  grainCtx.fillRect(0, 0, grainCanvas.width / grainScale, grainCanvas.height / grainScale);
  grainCtx.restore();
  requestAnimationFrame(tickGrain);
}
window.addEventListener('resize', setupGrain);
setupGrain();
tickGrain();

// Экспортируем для цикла (см. loop.js)
export { scene, camera, renderer, field };
