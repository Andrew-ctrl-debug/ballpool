/* ============================================================
   ШАГ 5. ВВОД: РЕАКЦИЯ НА МЫШЬ
   ============================================================
   Ловим движение и нажатие курсора на канвасе/геро-блоке.
   Когда курсор двигается:
     1) переводим координаты пикселей в "нормированные" (-1..1)
     2) создаём луч (ray) из камеры в эту точку
     3) передаём луч в поле — там шары отталкиваются от него.

   Понятие "нормированные координаты":
   -1..1 означает "X от левого края до правого, Y снизу вверх"
   ============================================================ */

import * as THREE from '../vendor/three/build/three.module.js';

export function setupInput(hero, camera, field) {
  // Временный объект для хранения нормированной позиции курсора
  const pointerNDC = new THREE.Vector2();

  // Сообщаем полю, какая камера используется (для raycaster)
  field.bindCamera(camera);

  /* --- ДВИЖЕНИЕ КУРСОРА --- */
  function onPointerMove(e) {
    // Прячем курсор? Нет. Просто считаем NDC.
    const rect = hero.getBoundingClientRect();
    // e.clientX — позиция курсора в пикселях относительно окна
    // Вычитаем rect.left, чтобы получить позицию внутри hero.
    pointerNDC.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,   // X: 0..1 → -1..1
      -(((e.clientY - rect.top) / rect.height) * 2 - 1) // Y: инвертируем (в 3D Y вверх)
    );
    field.setPointer(pointerNDC.x, pointerNDC.y);
  }

  /* --- НАЖАТИЕ (по желанию: разброс шаров кликом) --- */
  function onPointerDown(e) {
    // Пропускаем клики по ссылкам/кнопкам
    if (e.target.closest('a, button')) return;
    onPointerMove(e);
    // Клик по голубому шару — переходим на сайт ГТО.РУС
    if (field.hitTestBlueBall(pointerNDC.x, pointerNDC.y, camera)) {
      window.location.href = 'https://гто.рус/';
      return;
    }
    // Можно добавить дополнительный "взрыв" при клике —
    // в оригинале шары разлетаются с силой.
    // Пока оставим заготовку:
    field.burst ? field.burst(e) : null;
  }

  // Подписываемся на события (passive: true — не блокируем скролл)
  hero.addEventListener('pointermove', onPointerMove, { passive: true });
  hero.addEventListener('pointerdown', onPointerDown, { passive: true });
  hero.addEventListener('pointerleave', () => field.clearPointer(), { passive: true });
  hero.addEventListener('pointercancel', () => field.clearPointer(), { passive: true });
  window.addEventListener('scroll', () => field.clearPointer(), { passive: true });

  return { onPointerMove, onPointerDown };
}
