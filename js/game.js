/* グラフシューター — ゲームロジック（純粋関数中心・描画なし） */
(function () {
  'use strict';

  const GS = (globalThis.GS = globalThis.GS || {});
  const PROGRESS_KEY = 'gs-progress';
  const SAMPLES = 2000;

  /**
   * 弾道シミュレーション。
   * @returns {{points: {x:number,y:number}[], hits: {starIdx:number, idx:number}[], crashIdx: number|null}}
   *  points は左端から右端まで（衝突したらそこで打ち切り）。y は NaN の場合あり（定義されない点）。
   */
  function simulate(evalAt, level, collected) {
    const [x0, x1] = GS.RANGE.x;
    const r2 = GS.STAR_RADIUS * GS.STAR_RADIUS;
    const points = [];
    const hits = [];
    const remaining = new Set(level.stars.map((_, i) => i).filter((i) => !collected.has(i)));
    let crashIdx = null;

    for (let i = 0; i <= SAMPLES; i++) {
      const x = x0 + ((x1 - x0) * i) / SAMPLES;
      let y;
      try {
        y = evalAt(x);
      } catch (_) {
        y = NaN;
      }
      if (!isFinite(y)) y = NaN;
      points.push({ x, y });
      if (Number.isNaN(y)) continue;

      for (const s of remaining) {
        const dx = x - level.stars[s][0];
        const dy = y - level.stars[s][1];
        if (dx * dx + dy * dy < r2) {
          hits.push({ starIdx: s, idx: i });
          remaining.delete(s);
        }
      }
      for (const o of level.obstacles) {
        if (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) {
          crashIdx = i;
          break;
        }
      }
      if (crashIdx !== null) break;
    }
    return { points, hits, crashIdx };
  }

  /** プレビュー用（衝突判定なし・粗いサンプリング） */
  function trace(evalAt) {
    const [x0, x1] = GS.RANGE.x;
    const n = 600;
    const points = [];
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      let y;
      try {
        y = evalAt(x);
      } catch (_) {
        y = NaN;
      }
      points.push({ x, y: isFinite(y) ? y : NaN });
    }
    return points;
  }

  /** 発射回数とPARからランク（3=S, 2=A, 1=B） */
  function rank(shots, par) {
    if (shots <= par) return 3;
    if (shots <= par + 1) return 2;
    return 1;
  }

  function loadProgress() {
    try {
      return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {};
    } catch (_) {
      return {};
    }
  }

  function saveProgress(progress, levelId, stars) {
    const next = Object.assign({}, progress, {
      [levelId]: Math.max(progress[levelId] || 0, stars),
    });
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
    } catch (_) { /* 保存できない環境ではセッション内のみ */ }
    return next;
  }

  /** 最初から全ステージ解放（progress は星ランク表示にのみ使う） */
  function unlockedCount() {
    return GS.LEVELS.length;
  }

  GS.game = { simulate, trace, rank, loadProgress, saveProgress, unlockedCount };
})();
