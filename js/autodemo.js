/* グラフシューター — 自動デモ再生（画面録画用）
 * URL に ?demo=1 を付けて開くと、1分弱のデモを自動で再生する。
 * ステージ1 → 切片スイープでプレビュー変形 → 放物線 → sin波 → エディタで自作。
 * 通常アクセス（?demo=1 なし）には一切影響しない。
 */
(function () {
  'use strict';

  if (!/[?&]demo=1/.test(location.search)) return;

  const GS = globalThis.GS;
  const $ = (sel) => document.querySelector(sel);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // 入力欄に1文字ずつタイプ（プレビューが順に更新される）
  async function typeInto(sel, text, cps = 7) {
    const el = $(sel);
    el.value = '';
    el.dispatchEvent(new Event('input'));
    for (const ch of text) {
      el.value += ch;
      el.dispatchEvent(new Event('input'));
      await sleep(1000 / cps);
    }
  }

  // 発射 → クリアモーダルが出るのを待って、少し見せてから閉じる（フレームレート非依存）
  async function fireAndClear() {
    $('#btn-fire').click();
    const modal = $('#modal-clear');
    for (let i = 0; i < 80 && !modal.open; i++) await sleep(150); // 最大12秒待つ
    await sleep(1900); // 学びメモを見せる間
    if (modal.open) modal.close();
  }

  // プレビュー線を滑らかにスイープ（式の数値を連続変化させてグラフを動かす）
  async function sweepGhost(build, from, to, ms) {
    const r = GS.mainApi.renderer;
    const steps = Math.max(1, Math.round(ms / 16));
    for (let i = 0; i <= steps; i++) {
      const v = from + (to - from) * (i / steps);
      const src = build(v);
      $('#expr').value = src; // 表示だけ更新（inputイベントは出さない）
      try {
        r.setGhost(GS.game.trace(GS.parser_compile(src).evalAt));
      } catch (_) { /* 途中式が不正でも無視 */ }
      await sleep(16);
    }
  }

  // エディタ盤面の指定ワールド座標をタップ（星を置く）
  function placeStar(x, y) {
    const c = $('#editor-board');
    const rect = c.getBoundingClientRect();
    const W = 1000, H = 700, xMin = -10, xMax = 10, yMin = -7, yMax = 7;
    const s = Math.min(rect.width / W, rect.height / H);
    const ox = (rect.width - W * s) / 2, oy = (rect.height - H * s) / 2;
    const sx = (x) => ((x - xMin) / (xMax - xMin)) * W;
    const sy = (y) => H - ((y - yMin) / (yMax - yMin)) * H;
    c.dispatchEvent(new PointerEvent('pointerdown', {
      clientX: rect.left + ox + sx(x) * s,
      clientY: rect.top + oy + sy(y) * s,
      bubbles: true,
    }));
  }

  async function run() {
    // 録画用に見た目を整える（カーソルと音量UIを隠す）
    document.body.style.cursor = 'none';
    const ac = $('#audio-control');
    if (ac) ac.style.display = 'none';

    // 1) 比例（ステージ1）: 式を書く → 弾道で星を撃つ
    GS.mainApi.startLevel(GS.LEVELS[0]);
    await sleep(1300);
    await typeInto('#expr', '0.5x');
    await sleep(800);
    await fireAndClear();

    // 2) 一次関数（ステージ2）: 切片を 0→3 に動かしてグラフを持ち上げる（プレビュー変形の見せ場）
    GS.mainApi.startLevel(GS.LEVELS[1]);
    await sleep(1100);
    await typeInto('#expr', '0.5x');
    await sleep(700);
    await sweepGhost((b) => `0.5x + ${b.toFixed(1)}`, 0, 3, 2600);
    await sleep(500);
    await typeInto('#expr', '0.5x + 3');
    await sleep(700);
    await fireAndClear();

    // 3) 二次関数（ステージ4）: 放物線
    GS.mainApi.startLevel(GS.LEVELS[3]);
    await sleep(1100);
    await typeInto('#expr', '0.25x^2');
    await sleep(800);
    await fireAndClear();

    // 4) 三角関数（ステージ7・ノーレーダー）: sin波
    GS.mainApi.startLevel(GS.LEVELS[6]);
    await sleep(1100);
    await typeInto('#expr', '2sin(pi*x/2)');
    await sleep(800);
    await fireAndClear();

    // 5) エディタ: 自分で星を置いてオリジナル問題を作る
    $('#btn-new-stage').click();
    await sleep(1300);
    for (const [x, y] of [[2, 1], [4, 2], [6, 3]]) {
      placeStar(x, y);
      await sleep(650);
    }
    await typeInto('#editor-name', 'わたしのステージ', 10);
    await sleep(600);
    $('#btn-editor-save').click();
    await sleep(1800);

    // 6) 一覧に自作ステージが並ぶところを見せて締め
    GS.mainApi.show('select');
    await sleep(400);
    $('#custom-section') && $('#custom-section').scrollIntoView({ behavior: 'smooth' });
    await sleep(3200);
  }

  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run);
})();
