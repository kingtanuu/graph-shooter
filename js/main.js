/* グラフシューター — 画面遷移と UI 配線 */
(function () {
  'use strict';

  const GS = globalThis.GS;
  const $ = (sel) => document.querySelector(sel);

  const screens = {
    title: $('#screen-title'),
    select: $('#screen-select'),
    play: $('#screen-play'),
    editor: $('#screen-editor'),
  };
  const audioControl = $('#audio-control');

  let progress = GS.game.loadProgress();
  let level = null;
  let collected = new Set();
  let shots = 0;
  let cleared = false;
  const renderer = GS.createRenderer($('#board'));

  function show(name) {
    Object.entries(screens).forEach(([k, el]) => el.classList.toggle('active', k === name));
    if (name === 'title' || name === 'select') {
      audioControl.classList.remove('hidden');
      GS.sound.bgm.play();
    } else {
      // プレイ画面では音量コントロールを出さず、音は常にオフにする
      audioControl.classList.add('hidden');
      GS.sound.bgm.pause();
    }
  }

  // ---------- ステージ選択 ----------
  function starsText(n) {
    return '★'.repeat(n) + '☆'.repeat(3 - n);
  }

  function renderSelect() {
    const unlocked = GS.game.unlockedCount(progress);
    const list = $('#level-list');
    list.innerHTML = '';
    GS.LEVELS.forEach((lv, i) => {
      const locked = i >= unlocked;
      const btn = document.createElement('button');
      btn.className = 'level-card' + (locked ? ' locked' : '');
      btn.disabled = locked;
      btn.innerHTML = `
        <span class="level-num">${String(lv.id).padStart(2, '0')}</span>
        <span class="level-tags"><span class="tag">${lv.group}</span><span class="tag tag-grade">${lv.grade}</span></span>
        <span class="level-title">${locked ? '？？？' : lv.title}</span>
        <span class="level-stars ${progress[lv.id] ? 'earned' : ''}">${locked ? '🔒' : starsText(progress[lv.id] || 0)}</span>`;
      btn.addEventListener('click', () => {
        GS.sound.ui();
        startLevel(lv);
      });
      list.appendChild(btn);
    });
    if (GS.editor) GS.editor.renderList();
  }

  // ---------- プレイ ----------
  function startLevel(lv) {
    level = lv;
    collected = new Set();
    shots = 0;
    cleared = false;
    renderer.setLevel(lv, collected);
    $('#hud-num').textContent = lv.custom ? '✏' : String(lv.id).padStart(2, '0');
    $('#hud-title').textContent = lv.title;
    $('#hud-group').textContent = `${lv.group}・${lv.grade}`;
    $('#hud-par').textContent = `PAR ${lv.par}`;
    $('#level-desc').textContent = lv.desc;
    $('#expr').value = '';
    $('#expr-error').textContent = '';
    $('#hint-body').hidden = true;
    $('#hint-answer').hidden = true;
    $('#btn-answer').hidden = false;
    $('#no-preview-badge').hidden = lv.preview;
    updateHud();
    show('play');
    $('#expr').focus();
  }

  function updateHud() {
    $('#hud-stars').textContent = `⭐ ${collected.size} / ${level.stars.length}`;
    $('#hud-shots').textContent = `🚀 ${shots}`;
  }

  function updateGhost() {
    if (!level || !level.preview) return;
    const src = $('#expr').value.trim();
    if (!src) {
      renderer.setGhost(null);
      return;
    }
    try {
      const fn = GS.parser_compile(src);
      renderer.setGhost(GS.game.trace(fn.evalAt));
      $('#expr-error').textContent = '';
    } catch (_) {
      renderer.setGhost(null);
    }
  }

  let ghostTimer = null;
  $('#expr').addEventListener('input', () => {
    clearTimeout(ghostTimer);
    ghostTimer = setTimeout(updateGhost, 120);
  });

  function fire() {
    if (!level || renderer.busy || cleared) return;
    const src = $('#expr').value;
    let fn;
    try {
      fn = GS.parser_compile(src);
    } catch (e) {
      $('#expr-error').textContent = e.isParseError ? e.message : '式が読めなかったよ';
      $('#expr').classList.remove('shake');
      void $('#expr').offsetWidth;
      $('#expr').classList.add('shake');
      return;
    }
    $('#expr-error').textContent = '';
    shots++;
    updateHud();
    GS.sound.fire();
    const sim = GS.game.simulate(fn.evalAt, level, collected);
    renderer.fire(sim, {
      onStar(_idx, combo) {
        GS.sound.star(combo - 1);
        updateHud();
      },
      onCrash() {
        GS.sound.crash();
      },
      onEnd() {
        if (collected.size === level.stars.length) {
          cleared = true;
          setTimeout(onClear, 600);
        }
      },
    });
  }

  function onClear() {
    GS.sound.clear();
    const stars = GS.game.rank(shots, level.par);
    // 自作ステージのテストプレイは通常の進捗（gs-progress）を汚さない
    if (!level.custom) progress = GS.game.saveProgress(progress, level.id, stars);
    $('#clear-rank').textContent = stars === 3 ? 'S' : stars === 2 ? 'A' : 'B';
    $('#clear-rank').dataset.rank = String(stars);
    $('#clear-stars').textContent = starsText(stars);
    $('#clear-shots').textContent = `発射 ${shots} 回（PAR ${level.par}）`;
    $('#clear-lesson').textContent = level.lesson;
    const isLast = level.id >= GS.LEVELS.length;
    // 自作ステージには「次のステージ」も「全クリア」も無い
    $('#btn-next').hidden = level.custom || isLast;
    $('#all-clear-msg').hidden = level.custom || !isLast;
    $('#modal-clear').showModal();
  }

  // ---------- イベント ----------
  $('#btn-fire').addEventListener('click', fire);
  $('#expr').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') fire();
  });

  document.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('mousedown', (e) => e.preventDefault()); // フォーカス維持
    chip.addEventListener('click', () => {
      const input = $('#expr');
      const ins = chip.dataset.insert;
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;
      input.value = input.value.slice(0, start) + ins + input.value.slice(end);
      const caret = start + (ins.endsWith(')') ? ins.length - 1 : ins.length);
      input.focus();
      input.setSelectionRange(caret, caret);
      input.dispatchEvent(new Event('input'));
    });
  });

  $('#btn-hint').addEventListener('click', () => {
    GS.sound.ui();
    const body = $('#hint-body');
    body.hidden = !body.hidden;
    $('#hint-text').textContent = level.hint;
  });
  $('#btn-answer').addEventListener('click', () => {
    GS.sound.ui();
    $('#hint-answer').textContent = `答えの例: y = ${level.answer}`;
    $('#hint-answer').hidden = false;
    $('#btn-answer').hidden = true;
  });

  $('#btn-start').addEventListener('click', () => {
    GS.sound.ui();
    renderSelect();
    show('select');
  });
  $('#btn-back-title').addEventListener('click', () => show('title'));
  $('#btn-back-select').addEventListener('click', () => {
    // 自作ステージのテストプレイ中は、編集内容を保ったままエディタへ戻す
    if (level && level.custom && GS.editor) {
      GS.editor.reopen();
      return;
    }
    renderSelect();
    show('select');
  });

  $('#btn-retry').addEventListener('click', () => {
    $('#modal-clear').close();
    startLevel(level);
  });
  $('#btn-next').addEventListener('click', () => {
    $('#modal-clear').close();
    const next = GS.LEVELS.find((lv) => lv.id === level.id + 1);
    if (next) startLevel(next);
  });
  $('#btn-to-select').addEventListener('click', () => {
    $('#modal-clear').close();
    if (level && level.custom && GS.editor) {
      GS.editor.reopen();
      return;
    }
    renderSelect();
    show('select');
  });

  const muteBtn = $('#btn-mute');
  const volumeSlider = $('#volume-slider');
  const syncAudioControl = () => {
    muteBtn.textContent = GS.sound.muted ? '🔇' : '🔊';
    volumeSlider.value = String(GS.sound.getVolume());
  };
  muteBtn.addEventListener('click', () => {
    GS.sound.toggleMute();
    syncAudioControl();
    GS.sound.bgm.play(); // ミュート解除時は一時停止していたBGMを再開する
  });
  volumeSlider.addEventListener('input', () => {
    GS.sound.setVolume(Number(volumeSlider.value));
    syncAudioControl();
    GS.sound.bgm.play(); // 0から上げた場合に自動再生を再開する
  });
  syncAudioControl();

  // parser.js はテスト共用のため GSParser グローバル。エイリアスを張る
  GS.parser_compile = (src) => globalThis.GSParser.compile(src);

  // editor.js から画面遷移とステージ開始を呼べるように最小 API を公開する
  GS.mainApi = { show, startLevel };

  // ブラウザの自動再生制限でBGMが始まらなかった場合、最初の操作で再試行する
  const retryBgm = () => {
    document.removeEventListener('pointerdown', retryBgm);
    document.removeEventListener('keydown', retryBgm);
    if (screens.play.classList.contains('active')) return;
    GS.sound.bgm.play();
  };
  document.addEventListener('pointerdown', retryBgm, { once: true });
  document.addEventListener('keydown', retryBgm, { once: true });

  show('title');
})();
