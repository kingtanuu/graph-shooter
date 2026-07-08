// 数式パーサのユニットテスト:  node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { compile } = require('../js/parser.js');

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('比例: 0.5x を x=4 で評価すると 2', () => {
  assert.ok(near(compile('0.5x').evalAt(4), 2));
});

test('一次関数: y= プレフィックスを無視する', () => {
  assert.ok(near(compile('y = -x + 3').evalAt(4), -1));
});

test('暗黙の乗算: 2x, x(x+1), (x+1)(x-1), 2sin(x)', () => {
  assert.ok(near(compile('2x').evalAt(3), 6));
  assert.ok(near(compile('x(x+1)').evalAt(2), 6));
  assert.ok(near(compile('(x+1)(x-1)').evalAt(3), 8));
  assert.ok(near(compile('2sin(x)').evalAt(Math.PI / 2), 2));
});

test('べき乗は右結合、単項マイナスより強い: -x^2 = -(x^2)', () => {
  assert.ok(near(compile('-x^2').evalAt(2), -4));
  assert.ok(near(compile('2^3^2').evalAt(0), 512));
});

test('演算子の優先順位: 1+2*3^2 = 19', () => {
  assert.ok(near(compile('1+2*3^2').evalAt(0), 19));
});

test('関数: abs, sqrt, 頂点形の二次関数', () => {
  assert.ok(near(compile('abs(x-1)+2').evalAt(-1), 4));
  assert.ok(near(compile('sqrt(x)').evalAt(9), 3));
  assert.ok(near(compile('0.5(x-3)^2+1').evalAt(1), 3));
});

test('定数: pi と π と e', () => {
  assert.ok(near(compile('2sin(pi*x/2)').evalAt(1), 2));
  assert.ok(near(compile('sin(πx)').evalAt(0.5), 1));
  assert.ok(near(compile('e').evalAt(0), Math.E));
});

test('全角スペースを無視する', () => {
  assert.ok(near(compile('0.5x　+　3').evalAt(2), 4));
});

test('定義されない点は NaN/Infinity（throw しない）', () => {
  assert.ok(!isFinite(compile('1/x').evalAt(0)));
  assert.ok(Number.isNaN(compile('sqrt(x)').evalAt(-4)));
});

test('不正な式は日本語メッセージ付きで throw', () => {
  for (const bad of ['', '2**x', 'x+', '(x+1', 'x)', 'hoge', '2..5', 'y']) {
    assert.throws(() => compile(bad), (e) => e.isParseError, `should throw: "${bad}"`);
  }
});

test('レベルの模範解答が全ステージで妥当（星を通り障害物に当たらない）', () => {
  globalThis.GS = {};
  require('../js/levels.js');
  const { LEVELS, STAR_RADIUS } = globalThis.GS;
  for (const lv of LEVELS) {
    const fn = compile(lv.answer);
    // 星のうち模範解答が担当する分（総合ステージは一部でよい）が半径内にあるか
    const onCurve = lv.stars.filter(([x, y]) => Math.abs(fn.evalAt(x) - y) < STAR_RADIUS);
    assert.ok(onCurve.length >= Math.ceil(lv.stars.length / lv.par),
      `Lv${lv.id}: 模範解答が星を通らない`);
    // 障害物と衝突しないか（全域サンプリング）
    for (let i = 0; i <= 2000; i++) {
      const x = -10 + (20 * i) / 2000;
      const y = fn.evalAt(x);
      if (!isFinite(y)) continue;
      for (const o of lv.obstacles) {
        const inside = x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h;
        assert.ok(!inside, `Lv${lv.id}: 模範解答が障害物に衝突 (x=${x.toFixed(2)}, y=${y.toFixed(2)})`);
      }
    }
  }
});
