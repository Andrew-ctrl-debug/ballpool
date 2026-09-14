/* ============================================================
   ШАГ 6-8. ЦИКЛ ОТРИСОВКИ (game loop)
   ============================================================
   Анимация в браузере работает через requestAnimationFrame(rAF).
   Браузер вызывает нашу функцию ~60 раз/секунду. Внутри мы:
     1) считаем время между кадрами (deltaTime)
     2) двигаем физику (несколько раз, если кадр долгий)
     3) рисуем (render)
     4) просим браузер вызвать нас снова (rAF)

   ВАЖНО про "фиксированный шаг":
   Физику опасно запускать с разным dt (будет неточно/нестабильно).
   Решение — накапливать время и выполнять шаг по 1/120 сек
   целыми порциями. Это то же, что в оригинале.
   ============================================================ */

import { renderer, scene, camera, field } from './main.js';
import { createPostFX } from './postfx.js';

// Пост-обработка: afterimage/"рябь"
const postFX = createPostFX(renderer);

// Флаг: крутится ли цикл сейчас
let running = false;
// Метка последнего кадра (для подсчёта dt)
let last = 0;
// Аккумулятор времени для фиксированного шага
let accumulator = 0;
// Фиксированный шаг физики (сек)
const FIXED_DT = 1 / 120;

/* Один кадр. now — время от браузера (мс). */
function frame(now) {
  // Насколько времени прошло с прошлого кадра, в секундах.
  // Ограничиваем максимумом 1/30, чтобы если вкладка была
  // в фоне — шары не "телепортировались".
  const dt = Math.min((now - last) / 1000 || 0, 1 / 30);
  last = now;

  // Если вкладка скрыта — тормозим физику
  if (document.hidden) { stop(); return; }

  // Фиксированный шаг: накапливаем время и выполняем шаги.
  // Например, если кадр длился 1/60 сек, выполним 2 шага по 1/120.
  accumulator += dt;
  while (accumulator >= FIXED_DT) {
    field.stepField(FIXED_DT);
    accumulator -= FIXED_DT;
  }

  // Отрисовываем кадр (через пост-обработку — эффект "ряби")
  postFX.render(
    renderer.domElement.width,
    renderer.domElement.height,
    () => field.drawField(),
    () => renderer.render(scene, camera)
  );

  // Продолжаем цикл в следующем кадре
  running = true;
  requestAnimationFrame(frame);
}

function start() {
  if (running) return;
  last = performance.now();
  running = true;
  requestAnimationFrame(frame);
}
function stop() {
  running = false;
}

// Запускаем
start();

// Останавливаем, когда вкладка скрывается, возобновляем при показе
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stop();
  else start();
});
