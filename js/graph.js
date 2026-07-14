/* グラフシューター — Canvas 描画（座標平面・弾道・パーティクル） */
(function () {
  'use strict';

  const GS = (globalThis.GS = globalThis.GS || {});
  const W = 1000;
  const H = 700;
  const REDUCED = globalThis.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const COLORS = {
    grid: 'rgba(96, 205, 255, 0.08)',
    gridMajor: 'rgba(96, 205, 255, 0.16)',
    axis: 'rgba(150, 220, 255, 0.55)',
    label: 'rgba(150, 220, 255, 0.5)',
    star: '#ffd166',
    starDone: 'rgba(255, 209, 102, 0.22)',
    starLabel: 'rgba(255, 209, 102, 0.6)',
    obstacle: '#ff5a6a',
    curve: '#4de3ff',
    ghost: 'rgba(255, 255, 255, 0.38)',
  };

  function createRenderer(canvas) {
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    let level = null;
    let collected = new Set();
    let ghost = null; // プレビュー点列
    let shot = null; // {points, hits, crashIdx, drawn, done, onStar, onCrash, onEnd}
    let particles = [];
    let shake = 0;
    let time = 0;

    const [xMin, xMax] = GS.RANGE.x;
    const [yMin, yMax] = GS.RANGE.y;
    const sx = (x) => ((x - xMin) / (xMax - xMin)) * W;
    const sy = (y) => H - ((y - yMin) / (yMax - yMin)) * H;
    const unitX = W / (xMax - xMin);

    function setLevel(lv, collectedSet) {
      level = lv;
      collected = collectedSet;
      ghost = null;
      shot = null;
      particles = [];
      shake = 0;
    }

    // 画面上のクリック座標をワールド座標へ逆変換する（object-fit: contain のレターボックスを考慮）
    function toWorld(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const scale = Math.min(rect.width / W, rect.height / H);
      const offX = (rect.width - W * scale) / 2;
      const offY = (rect.height - H * scale) / 2;
      const cx = (clientX - rect.left - offX) / scale;
      const cy = (clientY - rect.top - offY) / scale;
      return {
        x: xMin + (cx / W) * (xMax - xMin),
        y: yMin + ((H - cy) / H) * (yMax - yMin),
      };
    }

    function setGhost(points) {
      ghost = points;
    }

    function fire(sim, handlers) {
      const total = sim.crashIdx !== null ? sim.crashIdx + 1 : sim.points.length;
      shot = Object.assign({}, sim, {
        total,
        drawn: 0,
        speed: REDUCED ? total : total / 80, // 約1.3秒で描画
        done: false,
        firedHits: new Set(),
      }, handlers);
      ghost = null;
    }

    function burst(x, y, color, n) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 40 + Math.random() * 180;
        particles.push({
          x: sx(x), y: sy(y),
          vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40,
          life: 0.6 + Math.random() * 0.5, t: 0,
          color, size: 1.5 + Math.random() * 2.5,
        });
      }
    }

    function drawGrid() {
      ctx.lineWidth = 1;
      for (let x = Math.ceil(xMin); x <= xMax; x++) {
        ctx.strokeStyle = x === 0 ? COLORS.axis : x % 5 === 0 ? COLORS.gridMajor : COLORS.grid;
        ctx.beginPath();
        ctx.moveTo(sx(x), 0);
        ctx.lineTo(sx(x), H);
        ctx.stroke();
      }
      for (let y = Math.ceil(yMin); y <= yMax; y++) {
        ctx.strokeStyle = y === 0 ? COLORS.axis : y % 5 === 0 ? COLORS.gridMajor : COLORS.grid;
        ctx.beginPath();
        ctx.moveTo(0, sy(y));
        ctx.lineTo(W, sy(y));
        ctx.stroke();
      }
      ctx.fillStyle = COLORS.label;
      ctx.font = '13px "M PLUS Rounded 1c", sans-serif';
      // 端のラベルは中央揃えだと画面外にはみ出るので、端だけ寄せて描く
      for (let x = Math.ceil(xMin / 5) * 5; x <= xMax; x += 5) {
        if (x === 0) continue;
        ctx.textAlign = x === xMin ? 'left' : x === xMax ? 'right' : 'center';
        ctx.fillText(String(x), sx(x), sy(0) + 18);
      }
      ctx.textAlign = 'right';
      for (let y = Math.ceil(yMin / 5) * 5; y <= yMax; y += 5) {
        if (y === 0) continue;
        const ty = y === yMax ? sy(y) + 12 : y === yMin ? sy(y) - 4 : sy(y) + 4;
        ctx.fillText(String(y), sx(0) - 8, ty);
      }
      ctx.textAlign = 'right';
      ctx.fillText('O', sx(0) - 8, sy(0) + 18);
    }

    function drawObstacles() {
      for (const o of level.obstacles) {
        const x = sx(o.x);
        const y = sy(o.y + o.h);
        const w = o.w * unitX;
        const h = (o.h / (yMax - yMin)) * H;
        ctx.save();
        ctx.fillStyle = 'rgba(255, 90, 106, 0.13)';
        ctx.fillRect(x, y, w, h);
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        ctx.strokeStyle = 'rgba(255, 90, 106, 0.35)';
        ctx.lineWidth = 2;
        for (let s = -h; s < w; s += 14) {
          ctx.beginPath();
          ctx.moveTo(x + s, y + h);
          ctx.lineTo(x + s + h, y);
          ctx.stroke();
        }
        ctx.restore();
        ctx.strokeStyle = COLORS.obstacle;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, w, h);
      }
    }

    function starPath(cx, cy, r, rot) {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const rr = i % 2 === 0 ? r : r * 0.45;
        const a = rot + (Math.PI * i) / 5 - Math.PI / 2;
        const px = cx + Math.cos(a) * rr;
        const py = cy + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    }

    function drawStars() {
      level.stars.forEach(([x, y], i) => {
        const done = collected.has(i);
        const pulse = REDUCED ? 1 : 1 + Math.sin(time * 2.4 + i * 1.7) * 0.1;
        const r = GS.STAR_RADIUS * unitX * 0.95 * (done ? 0.8 : pulse);
        ctx.save();
        if (!done) {
          ctx.shadowColor = COLORS.star;
          ctx.shadowBlur = 16;
        }
        ctx.fillStyle = done ? COLORS.starDone : COLORS.star;
        starPath(sx(x), sy(y), r, done ? 0 : time * 0.5);
        ctx.fill();
        ctx.restore();
        if (!done) {
          ctx.fillStyle = COLORS.starLabel;
          ctx.font = '12px "M PLUS Rounded 1c", sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(`(${x}, ${y})`, sx(x) + r + 4, sy(y) - r * 0.4);
        }
      });
    }

    function strokePolyline(points, upTo, style, width, glow, dashed) {
      ctx.save();
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.lineJoin = 'round';
      if (dashed) ctx.setLineDash([6, 7]);
      if (glow && !REDUCED) {
        ctx.shadowColor = style;
        ctx.shadowBlur = 12;
      }
      const yPad = (yMax - yMin) * 2;
      let started = false;
      let prevY = NaN;
      ctx.beginPath();
      for (let i = 0; i < upTo; i++) {
        const p = points[i];
        const bad = Number.isNaN(p.y) || p.y > yMax + yPad || p.y < yMin - yPad;
        const jump = !Number.isNaN(prevY) && !Number.isNaN(p.y) && Math.abs(p.y - prevY) > (yMax - yMin) * 1.5;
        if (bad || jump) {
          started = false;
        } else if (!started) {
          ctx.moveTo(sx(p.x), sy(p.y));
          started = true;
        } else {
          ctx.lineTo(sx(p.x), sy(p.y));
        }
        prevY = p.y;
      }
      ctx.stroke();
      ctx.restore();
    }

    function drawShot(dt) {
      if (!shot) return;
      if (!shot.done) {
        shot.drawn = Math.min(shot.drawn + shot.speed * (dt * 60), shot.total);
        const idx = Math.floor(shot.drawn);
        for (const h of shot.hits) {
          if (h.idx <= idx && !shot.firedHits.has(h.starIdx)) {
            shot.firedHits.add(h.starIdx);
            collected.add(h.starIdx);
            const [hx, hy] = level.stars[h.starIdx];
            burst(hx, hy, COLORS.star, REDUCED ? 8 : 26);
            shot.onStar && shot.onStar(h.starIdx, shot.firedHits.size);
          }
        }
        if (shot.drawn >= shot.total) {
          shot.done = true;
          if (shot.crashIdx !== null) {
            const p = shot.points[shot.crashIdx];
            burst(p.x, p.y, COLORS.obstacle, REDUCED ? 10 : 40);
            if (!REDUCED) shake = 1;
            shot.onCrash && shot.onCrash();
          }
          shot.onEnd && shot.onEnd();
        }
      }
      strokePolyline(shot.points, Math.min(Math.floor(shot.drawn) + 1, shot.points.length), COLORS.curve, 3, true, false);
      // 弾道の先頭（彗星の頭）
      if (!shot.done) {
        const head = shot.points[Math.min(Math.floor(shot.drawn), shot.points.length - 1)];
        if (head && !Number.isNaN(head.y)) {
          ctx.save();
          ctx.fillStyle = '#fff';
          ctx.shadowColor = COLORS.curve;
          ctx.shadowBlur = 18;
          ctx.beginPath();
          ctx.arc(sx(head.x), sy(head.y), 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    }

    function drawParticles(dt) {
      particles = particles.filter((p) => (p.t += dt) < p.life);
      for (const p of particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 220 * dt;
        const a = 1 - p.t / p.life;
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;
    }

    let last = performance.now();
    function frame(now) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      time += dt;
      ctx.clearRect(0, 0, W, H);
      if (level) {
        ctx.save();
        if (shake > 0) {
          shake = Math.max(0, shake - dt * 3);
          ctx.translate((Math.random() - 0.5) * 14 * shake, (Math.random() - 0.5) * 14 * shake);
        }
        drawGrid();
        drawObstacles();
        if (ghost) strokePolyline(ghost, ghost.length, COLORS.ghost, 2, false, true);
        drawStars();
        drawShot(dt);
        drawParticles(dt);
        ctx.restore();
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    return {
      setLevel,
      setGhost,
      fire,
      toWorld,
      get busy() { return !!shot && !shot.done; },
    };
  }

  GS.createRenderer = createRenderer;
})();
