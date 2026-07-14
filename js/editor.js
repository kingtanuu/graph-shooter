/* グラフシューター — オリジナルステージエディタ（最小版）
 * 盤面をタップして星を配置し、名前をつけて localStorage に保存。
 * 作ったステージは既存のプレイエンジン（GS.mainApi.startLevel）でそのまま遊べる。
 */
(function () {
  'use strict';

  const GS = globalThis.GS;
  const $ = (sel) => document.querySelector(sel);
  const STORAGE_KEY = 'gs-custom-stages';
  const MAX_STARS = 3;
  const MIN_STARS = 2;

  const [X0, X1] = GS.RANGE.x;
  const [Y0, Y1] = GS.RANGE.y;

  let renderer = null; // エディタ用 canvas は初回だけ生成する
  let stage = { stars: [], par: 1 }; // 編集中のステージ
  let editingId = null; // 保存済みを編集中なら その id、新規なら null
  let msgTimer = null;

  // ---------- 永続化 ----------
  function loadAll() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch (_) {
      return [];
    }
  }
  function saveAll(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (_) { /* 保存できない環境ではセッション内のみ */ }
  }

  // ---------- ユーティリティ ----------
  const snap = (v) => Math.round(v * 2) / 2; // 0.5 刻みにスナップ
  const clampPar = () => {
    const n = Math.round(Number($('#editor-par').value));
    return Math.min(5, Math.max(1, Number.isFinite(n) ? n : 1));
  };

  function message(text) {
    const el = $('#editor-msg');
    el.textContent = text;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { el.textContent = ''; }, 2200);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // 編集中の stage を、プレイ可能なステージオブジェクトへ変換
  function toStageObject(id, name) {
    return {
      id,
      custom: true,
      group: '自作',
      grade: 'オリジナル',
      title: name || '無題のステージ',
      desc: '自分で作ったオリジナルステージ。星を全部撃ち抜こう！',
      par: stage.par,
      stars: stage.stars.map((s) => s.slice()),
      obstacles: [],
      preview: true,
      hint: '自作ステージなのでヒントはお休み。自分の目でグラフを読もう！',
      answer: '—',
      lesson: '自分で作った問題をクリア！ 友達にも挑戦してもらおう。',
    };
  }

  // ---------- 描画反映 ----------
  function refresh() {
    // renderer は stars を [x,y] の配列として描く。collected は空 Set（すべて未取得表示）
    renderer.setLevel({ stars: stage.stars, obstacles: [], preview: true }, new Set());
    $('#editor-count').textContent = `⭐ ${stage.stars.length}`;
    $('#editor-par').value = String(stage.par);
  }

  // ---------- canvas 配線 ----------
  function ensureRenderer() {
    if (renderer) return;
    renderer = GS.createRenderer($('#editor-board'));
    $('#editor-board').addEventListener('pointerdown', onBoardPointer);
  }

  function onBoardPointer(e) {
    const w = renderer.toWorld(e.clientX, e.clientY);
    const x = snap(w.x);
    const y = snap(w.y);
    if (x < X0 || x > X1 || y < Y0 || y > Y1) return;
    const idx = stage.stars.findIndex(([sx, sy]) => sx === x && sy === y);
    if (idx >= 0) {
      stage.stars.splice(idx, 1); // 既にある星をタップ → 削除
      GS.sound.ui();
    } else {
      if (stage.stars.length >= MAX_STARS) {
        message(`星は${MAX_STARS}個までだよ`);
        return;
      }
      stage.stars.push([x, y]);
      GS.sound.star(0);
    }
    refresh();
  }

  // ---------- 画面遷移 ----------
  function openNew() {
    editingId = null;
    stage = { stars: [], par: 1 };
    ensureRenderer();
    $('#editor-name').value = '';
    $('#editor-msg').textContent = '';
    refresh();
    GS.mainApi.show('editor');
  }

  function openEdit(record) {
    editingId = record.id;
    stage = { stars: record.stars.map((s) => s.slice()), par: record.par };
    ensureRenderer();
    $('#editor-name').value = record.name;
    $('#editor-msg').textContent = '';
    refresh();
    GS.mainApi.show('editor');
  }

  // テストプレイから編集内容を保ったまま戻る
  function reopen() {
    ensureRenderer();
    refresh();
    GS.mainApi.show('editor');
  }

  // ---------- アクション ----------
  function testPlay() {
    stage.par = clampPar();
    if (stage.stars.length < MIN_STARS) {
      message(`星を${MIN_STARS}個以上おいてね`);
      return;
    }
    GS.mainApi.startLevel(toStageObject('custom-test', $('#editor-name').value.trim()));
  }

  function doSave() {
    stage.par = clampPar();
    if (stage.stars.length < MIN_STARS) {
      message(`星を${MIN_STARS}個以上おいてね`);
      return;
    }
    const name = ($('#editor-name').value.trim() || '無題のステージ').slice(0, 20);
    const record = {
      id: editingId || 'c' + Date.now(),
      name,
      par: stage.par,
      stars: stage.stars.map((s) => s.slice()),
    };
    const list = loadAll();
    const i = list.findIndex((s) => s.id === record.id);
    if (i >= 0) list[i] = record;
    else list.push(record);
    saveAll(list);
    editingId = record.id;
    GS.sound.clear();
    message('保存したよ！ ステージ選択から遊べるよ');
    renderList();
  }

  function clearAll() {
    if (stage.stars.length === 0) return;
    stage.stars = [];
    GS.sound.ui();
    refresh();
  }

  // ---------- 自作ステージ一覧 ----------
  function renderList() {
    const list = loadAll();
    const container = $('#custom-list');
    container.innerHTML = '';
    $('#custom-section').querySelector('.custom-empty').hidden = list.length > 0;
    list.forEach((rec) => {
      const card = document.createElement('div');
      card.className = 'level-card custom-card';
      const starCount = Math.min(rec.stars.length, MAX_STARS);
      const stars = '★'.repeat(starCount) + '☆'.repeat(MAX_STARS - starCount);
      card.innerHTML = `
        <span class="level-num">✏</span>
        <span class="level-tags"><span class="tag">自作</span><span class="tag tag-grade">PAR ${rec.par}</span></span>
        <span class="level-title">${escapeHtml(rec.name)}</span>
        <span class="level-stars earned">${stars}</span>
        <span class="custom-actions">
          <button class="custom-btn" data-act="play" data-id="${rec.id}">遊ぶ</button>
          <button class="custom-btn" data-act="edit" data-id="${rec.id}">編集</button>
          <button class="custom-btn custom-btn-del" data-act="del" data-id="${rec.id}">削除</button>
        </span>`;
      container.appendChild(card);
    });
  }

  function onListClick(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = btn.dataset.id;
    const rec = loadAll().find((s) => s.id === id);
    if (!rec) return;
    GS.sound.ui();
    if (btn.dataset.act === 'play') {
      editingId = rec.id;
      stage = { stars: rec.stars.map((s) => s.slice()), par: rec.par };
      GS.mainApi.startLevel(toStageObject(rec.id, rec.name));
    } else if (btn.dataset.act === 'edit') {
      openEdit(rec);
    } else if (btn.dataset.act === 'del') {
      saveAll(loadAll().filter((s) => s.id !== id));
      renderList();
    }
  }

  // ---------- 配線 ----------
  $('#btn-new-stage').addEventListener('click', () => { GS.sound.ui(); openNew(); });
  $('#btn-editor-back').addEventListener('click', () => { GS.sound.ui(); GS.mainApi.show('select'); });
  $('#btn-editor-test').addEventListener('click', testPlay);
  $('#btn-editor-save').addEventListener('click', doSave);
  $('#btn-editor-clear').addEventListener('click', clearAll);
  $('#editor-par').addEventListener('change', () => { stage.par = clampPar(); refresh(); });
  $('#custom-list').addEventListener('click', onListClick);

  GS.editor = { renderList, reopen };
  renderList();
})();
