/* ============================================================
   ПОСТ-ОБРАБОТКА: ЭФФЕКТ "РЯБИ" (afterimage / TAA-ghosting)
   ============================================================
   Как на erik-shevchenko.com: TRAANode делает temporal репроекцию,
   из-за чего быстро движущиеся объекты оставляют лёгкий "хвост"
   (ghosting). Здесь это просто: рендерим сцену в текстуру, затем
   смешиваем её с предыдущим кадром (lerp). Каждый кадр предыдущий
   кадр "остывает", поэтому след-замирание выглядит как рябь.
   ============================================================ */

import * as THREE from '../vendor/three/build/three.module.js';

export function createPostFX(renderer) {
  const rtScene = new THREE.WebGLRenderTarget(1, 1);
  const rtFront = new THREE.WebGLRenderTarget(1, 1);
  const rtBack = new THREE.WebGLRenderTarget(1, 1);

  const quadGeo = new THREE.PlaneGeometry(2, 2);
  quadGeo.frustumCulled = false;
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const compositeMat = new THREE.ShaderMaterial({
    uniforms: {
      tCurrent: { value: null },
      tPrev: { value: null },
      uDamp: { value: 0.78 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tCurrent;
      uniform sampler2D tPrev;
      uniform float uDamp;
      varying vec2 vUv;
      void main() {
        vec4 cur = texture2D(tCurrent, vUv);
        vec4 prev = texture2D(tPrev, vUv);
        gl_FragColor = mix(cur, prev, uDamp);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
  const compositeScene = new THREE.Scene();
  compositeScene.add(new THREE.Mesh(quadGeo, compositeMat));

  const presentMat = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      varying vec2 vUv;
      void main() {
        vec4 c = texture2D(tDiffuse, vUv);
        // Лёгкая гамма 2.2 — возвращаем контраст, который рендерер
        // применяет при выводе в sRGB напрямую.
        gl_FragColor = vec4(pow(c.rgb, vec3(1.0 / 2.2)), 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
  const presentScene = new THREE.Scene();
  presentScene.add(new THREE.Mesh(quadGeo, presentMat));

  let rtPrev = rtFront;
  let rtOut = rtBack;
  let lastW = -1, lastH = -1;
  let firstFrame = true;

  function syncSize(w, h) {
    if (w === lastW && h === lastH) return;
    lastW = w; lastH = h;
    rtScene.setSize(w, h);
    rtFront.setSize(w, h);
    rtBack.setSize(w, h);
  }

  // Рендерит сцену, применяя послекадровый "хвост". Вызывается из loop.js:
  //   postFX.render(field.drawField, () => renderer.render(scene, camera))
  function render(w, h, setMatrices, drawScene) {
    syncSize(w, h);

    // 1) Свежий кадр сцены → rtScene
    setMatrices();
    renderer.setRenderTarget(rtScene);
    drawScene();

    // Первый кадр: предыдущего следа ещё нет, используем сам свежий кадр
    if (firstFrame) {
      renderer.setRenderTarget(rtPrev);
      drawScene();
      firstFrame = false;
    }

    // 2) Смешиваем свежий кадр со следом предыдущего → rtOut
    compositeMat.uniforms.tCurrent.value = rtScene.texture;
    compositeMat.uniforms.tPrev.value = rtPrev.texture;
    renderer.setRenderTarget(rtOut);
    renderer.render(compositeScene, quadCam);

    // 3) Пинг-понг: текущий составной кадр становится "предыдущим"
    const swap = rtPrev; rtPrev = rtOut; rtOut = swap;

    // 4) Показываем итоговый кадр на канвас
    presentMat.uniforms.tDiffuse.value = rtPrev.texture;
    renderer.setRenderTarget(null);
    renderer.render(presentScene, quadCam);
  }

  return { render };
}