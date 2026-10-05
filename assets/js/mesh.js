/* ==========================================================================
   Hero background: an unstructured triangular mesh treated as a graph.

   Moving the cursor (or tapping on a phone) "excites" the nearest node, and
   the glow spreads to its neighbours hop by hop, like message passing in a
   graph neural network, then fades. The animation only runs while something
   is glowing, and people who turn off animations see a still mesh.

   Settings you might want to change are at the top. No libraries needed.
   ========================================================================== */
(function () {
  'use strict';

  const canvas = document.getElementById('hero-mesh');
  if (!canvas || !canvas.getContext) return;
  const hero = canvas.parentElement;
  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- Settings ------------------------------------------------------------
  const SPACING = 46;       // average distance between nodes, in pixels
  const HOPS = 4;           // how far a touch spreads through the graph
  const HOP_DELAY = 75;     // milliseconds between one hop and the next
  const FADE = 0.94;        // how quickly the glow fades (closer to 1 = slower)
  const LINE = 'rgba(255, 255, 255, 0.06)';
  const DOT = 'rgba(255, 255, 255, 0.10)';

  // Accent colour from style.css (--accent), as an "r, g, b" string
  function accentRGB() {
    const probe = document.createElement('canvas').getContext('2d');
    probe.fillStyle = '#7a96ff';
    probe.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7a96ff';
    const hex = /^#[0-9a-f]{6}$/i.test(probe.fillStyle) ? probe.fillStyle : '#7a96ff';
    return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ');
  }
  let GLOW = accentRGB();
  // Follow the colour of the greeting in the hero (sent by main.js)
  window.addEventListener('greetcolor', (e) => {
    const h = e.detail;
    if (/^#[0-9a-f]{6}$/i.test(h)) GLOW = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(', ');
  });

  // Seeded random numbers: the same screen size always gives the same mesh
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- 1. Nodes: Poisson-disk sampling (Bridson's algorithm) -------------------
  function poisson(w, h, r, rand) {
    const cell = r / Math.SQRT2;
    const gw = Math.ceil(w / cell), gh = Math.ceil(h / cell);
    const grid = new Int32Array(gw * gh).fill(-1);
    const pts = [], active = [];
    const add = (x, y) => {
      grid[((y / cell) | 0) * gw + ((x / cell) | 0)] = pts.length;
      active.push(pts.length);
      pts.push([x, y]);
    };
    add(rand() * w, rand() * h);
    while (active.length) {
      const k = (rand() * active.length) | 0;
      const [px, py] = pts[active[k]];
      let placed = false;
      for (let t = 0; t < 20 && !placed; t++) {
        const ang = rand() * Math.PI * 2, d = r * (1 + rand());
        const x = px + Math.cos(ang) * d, y = py + Math.sin(ang) * d;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const gx = (x / cell) | 0, gy = (y / cell) | 0;
        let ok = true;
        for (let j = Math.max(0, gy - 2); ok && j <= Math.min(gh - 1, gy + 2); j++) {
          for (let i = Math.max(0, gx - 2); i <= Math.min(gw - 1, gx + 2); i++) {
            const q = grid[j * gw + i];
            if (q >= 0 && (pts[q][0] - x) ** 2 + (pts[q][1] - y) ** 2 < r * r) { ok = false; break; }
          }
        }
        if (ok) { add(x, y); placed = true; }
      }
      if (!placed) active.splice(k, 1);
    }
    return pts;
  }

  // ---- 2. Elements: Delaunay triangulation (Bowyer–Watson) ---------------------
  function triangulate(P) {
    const n = P.length;
    const big = 1e5;
    const V = P.concat([[-big, -big], [big, -big], [0, big]]);
    const tri = (a, b, c) => {
      const [ax, ay] = V[a], [bx, by] = V[b], [cx, cy] = V[c];
      const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
      const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
      const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
      const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
      return { a, b, c, x: ux, y: uy, r2: (ax - ux) ** 2 + (ay - uy) ** 2 };
    };
    let tris = [tri(n, n + 1, n + 2)];
    for (let i = 0; i < n; i++) {
      const [px, py] = V[i];
      const edges = new Map();
      const keep = [];
      for (const t of tris) {
        if ((t.x - px) ** 2 + (t.y - py) ** 2 < t.r2) {
          for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]]) {
            const key = u < v ? u * 1e6 + v : v * 1e6 + u;
            if (edges.has(key)) edges.delete(key); else edges.set(key, [u, v]);
          }
        } else keep.push(t);
      }
      for (const [u, v] of edges.values()) keep.push(tri(u, v, i));
      tris = keep;
    }
    return tris.filter((t) => t.a < n && t.b < n && t.c < n);
  }

  // ---- 3. Graph: edges and neighbours ------------------------------------------
  let W = 0, H = 0, dpr = 1;
  let pts = [], edges = [], adj = [], act = new Float32Array(0);
  let still = null;              // the faint mesh, drawn once and reused every frame

  function build() {
    const rand = mulberry32(20240901);
    // Sample slightly beyond the edges so the mesh has no visible border
    const m = SPACING;
    pts = poisson(W + 2 * m, H + 2 * m, SPACING, rand).map(([x, y]) => [x - m, y - m]);
    const seen = new Set();
    edges = [];
    adj = pts.map(() => []);
    for (const t of triangulate(pts)) {
      for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]]) {
        const key = u < v ? u * 1e6 + v : v * 1e6 + u;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push([u, v]);
        adj[u].push(v);
        adj[v].push(u);
      }
    }
    act = new Float32Array(pts.length);
    queue = [];

    still = document.createElement('canvas');
    still.width = canvas.width;
    still.height = canvas.height;
    const s = still.getContext('2d');
    s.setTransform(dpr, 0, 0, dpr, 0, 0);
    s.strokeStyle = LINE;
    s.lineWidth = 1;
    s.beginPath();
    for (const [u, v] of edges) { s.moveTo(pts[u][0], pts[u][1]); s.lineTo(pts[v][0], pts[v][1]); }
    s.stroke();
    s.fillStyle = DOT;
    s.beginPath();
    for (const [x, y] of pts) { s.moveTo(x + 1.2, y); s.arc(x, y, 1.2, 0, Math.PI * 2); }
    s.fill();
  }

  // ---- 4. Message passing: a touch spreads hop by hop ---------------------------
  let queue = [];                // { node, at, value } waiting to light up
  let running = false;

  function excite(start, hops) {
    const now = performance.now();
    const seen = new Set([start]);
    let frontier = [start];
    for (let h = 0; h <= hops; h++) {
      const value = 1 - h / (hops + 1);
      for (const node of frontier) queue.push({ node, at: now + h * HOP_DELAY, value });
      const next = [];
      for (const u of frontier) for (const v of adj[u]) if (!seen.has(v)) { seen.add(v); next.push(v); }
      frontier = next;
    }
    if (!running) { running = true; requestAnimationFrame(frame); }
  }

  function nearest(x, y) {
    let best = -1, bestD = (SPACING * 1.2) ** 2;
    for (let i = 0; i < pts.length; i++) {
      const d = (pts[i][0] - x) ** 2 + (pts[i][1] - y) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  // ---- 5. Drawing ------------------------------------------------------------------
  const LEVELS = 10;

  function frame(now) {
    // Light up nodes whose turn has come, then let everything fade
    queue = queue.filter((e) => {
      if (e.at > now) return true;
      if (act[e.node] < e.value) act[e.node] = e.value;
      return false;
    });

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (still) ctx.drawImage(still, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Glowing edges, grouped by brightness so each group is one draw call
    const paths = Array.from({ length: LEVELS }, () => new Path2D());
    let glowing = false;
    for (const [u, v] of edges) {
      const g = Math.sqrt(act[u] * act[v]);
      if (g < 0.03) continue;
      glowing = true;
      const l = Math.min(LEVELS - 1, (g * LEVELS) | 0);
      paths[l].moveTo(pts[u][0], pts[u][1]);
      paths[l].lineTo(pts[v][0], pts[v][1]);
    }
    for (let l = 0; l < LEVELS; l++) {
      const g = (l + 0.5) / LEVELS;
      ctx.strokeStyle = `rgba(${GLOW}, ${0.5 * g})`;
      ctx.lineWidth = 1 + g * 0.8;
      ctx.stroke(paths[l]);
    }
    for (let i = 0; i < act.length; i++) {
      if (act[i] < 0.03) continue;
      glowing = true;
      ctx.fillStyle = `rgba(${GLOW}, ${0.7 * act[i]})`;
      ctx.beginPath();
      ctx.arc(pts[i][0], pts[i][1], 1.2 + 1.8 * act[i], 0, Math.PI * 2);
      ctx.fill();
      act[i] *= FADE;
    }

    if (glowing || queue.length) requestAnimationFrame(frame);
    else running = false;
  }

  function drawStill() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (still) ctx.drawImage(still, 0, 0);
  }

  // ---- 6. Sizing ----------------------------------------------------------------------
  function resize() {
    const r = hero.getBoundingClientRect();
    const w = Math.round(r.width), h = Math.round(r.height);
    if (!w || !h || (Math.abs(w - W) < 2 && Math.abs(h - H) < 2)) return;
    W = w; H = h;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    build();
    drawStill();
  }

  let resizeTimer = 0;
  const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 150); };
  if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(hero);
  else window.addEventListener('resize', onResize);
  resize();

  if (reduceMotion) return;   // still mesh only

  // ---- 7. Interaction -------------------------------------------------------------------
  let last = -1;
  function local(e) {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }
  hero.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const node = nearest(...local(e));
    if (node >= 0 && node !== last) { last = node; excite(node, HOPS); }
  });
  hero.addEventListener('pointerleave', () => { last = -1; });
  hero.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    const node = nearest(...local(e));
    if (node >= 0) excite(node, HOPS + 2);   // a tap sends a wider ripple
  });

  // One gentle ripple shortly after the page loads, as a hint that it is alive
  setTimeout(() => {
    const node = nearest(W * 0.56, H * 0.62);
    if (node >= 0) excite(node, HOPS + 2);
  }, 900);
})();
