/* グラフシューター — ステージデータ
 * stars: [x, y] の配列（獲得目標）
 * obstacles: {x, y, w, h}（左下基準のワールド座標。当たると爆発）
 * par: この回数以内の発射でランクS
 * preview: false のステージは弾道プレビューなし（ノーレーダー戦）
 */
(function () {
  'use strict';

  const RANGE = { x: [-10, 10], y: [-7, 7] };

  const LEVELS = [
    {
      id: 1,
      group: '比例',
      grade: '小6・中1',
      title: 'まっすぐ撃て！',
      desc: '原点を通る直線で、ならんだ星を一気に撃ち抜こう。',
      par: 1,
      stars: [[2, 1], [4, 2], [6, 3]],
      obstacles: [],
      preview: true,
      hint: '比例 y = ax のグラフは原点を通る直線。星を見ると x が 2 増えるごとに y が 1 増えている。つまり傾き a は…？',
      answer: '0.5x',
      lesson: '比例 y = ax の a（傾き）は「x が 1 増えたときの y の増え方」。a = y ÷ x で求められる。',
    },
  ];

  const GS = (globalThis.GS = globalThis.GS || {});
  GS.LEVELS = LEVELS;
  GS.RANGE = RANGE;
  GS.STAR_RADIUS = 0.45;
})();
