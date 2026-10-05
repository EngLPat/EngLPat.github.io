/* ==========================================================================
   The two meshes on the page, both treated as graphs:

   1. HERO BACKGROUND: a faint unstructured mesh behind the hero. Moving the
      cursor (or tapping on a phone) excites the nearest node, and the glow
      spreads to its neighbours hop by hop, like message passing in a graph
      neural network, then fades.

   2. VON NEUMANN'S ELEPHANT (Contact section): "With four parameters I can
      fit an elephant, and with five I can make him wiggle his trunk." The
      outline is the five-parameter curve of Mayer, Khairy & Howard,
      Am. J. Phys. 78, 648 (2010), meshed into a graph. Hovering wiggles the
      trunk (deflected like a cantilever beam) and lights up the graph.

   Animations only run while something moves, and people who turn off
   animations see still meshes. Settings are at the top of each part.
   ========================================================================== */
(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ==== Shared tools =========================================================

  // Seeded random numbers: the same input always gives the same mesh
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const toRGB = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ');

  // Glow colour: starts as --accent, then follows the hero greeting (main.js)
  let GLOW = (() => {
    const probe = document.createElement('canvas').getContext('2d');
    probe.fillStyle = '#7a96ff';
    probe.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7a96ff';
    return toRGB(/^#[0-9a-f]{6}$/i.test(probe.fillStyle) ? probe.fillStyle : '#7a96ff');
  })();
  window.addEventListener('greetcolor', (e) => {
    if (/^#[0-9a-f]{6}$/i.test(e.detail)) GLOW = toRGB(e.detail);
  });

  // Poisson-disk sampling in a w × h rectangle (Bridson's algorithm)
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

  // Delaunay triangulation (Bowyer–Watson)
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

  // Unique edges and neighbour lists from a list of triangles
  function graphOf(nodeCount, tris) {
    const seen = new Set();
    const edges = [];
    const adj = Array.from({ length: nodeCount }, () => []);
    for (const t of tris) {
      for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]]) {
        const key = u < v ? u * 1e6 + v : v * 1e6 + u;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push([u, v]);
        adj[u].push(v);
        adj[v].push(u);
      }
    }
    return { edges, adj };
  }

  // Message passing: exciting a node lights it up, then its neighbours hop by hop
  function makeGlow(adj, hopDelay, fade) {
    const act = new Float32Array(adj.length);
    let queue = [];
    return {
      act,
      excite(start, hops) {
        const now = performance.now();
        const seen = new Set([start]);
        let frontier = [start];
        for (let h = 0; h <= hops; h++) {
          const value = 1 - h / (hops + 1);
          for (const node of frontier) queue.push({ node, at: now + h * hopDelay, value });
          const next = [];
          for (const u of frontier) for (const v of adj[u]) if (!seen.has(v)) { seen.add(v); next.push(v); }
          frontier = next;
        }
      },
      // Advance one frame; returns true while anything is still glowing
      step(now) {
        queue = queue.filter((e) => {
          if (e.at > now) return true;
          if (act[e.node] < e.value) act[e.node] = e.value;
          return false;
        });
        let alive = queue.length > 0;
        for (let i = 0; i < act.length; i++) {
          if (act[i] < 0.03) { act[i] = 0; continue; }
          act[i] *= fade;
          alive = true;
        }
        return alive;
      },
    };
  }

  // Draw the glowing part of a graph (edges grouped by brightness for speed)
  function drawGlow(ctx, pos, edges, act, strength) {
    const LEVELS = 10;
    const paths = Array.from({ length: LEVELS }, () => new Path2D());
    for (const [u, v] of edges) {
      const g = Math.sqrt(act[u] * act[v]);
      if (g < 0.03) continue;
      const l = Math.min(LEVELS - 1, (g * LEVELS) | 0);
      paths[l].moveTo(pos[u][0], pos[u][1]);
      paths[l].lineTo(pos[v][0], pos[v][1]);
    }
    for (let l = 0; l < LEVELS; l++) {
      const g = (l + 0.5) / LEVELS;
      ctx.strokeStyle = `rgba(${GLOW}, ${strength * g})`;
      ctx.lineWidth = 1 + g * 0.8;
      ctx.stroke(paths[l]);
    }
    for (let i = 0; i < act.length; i++) {
      if (act[i] < 0.03) continue;
      ctx.fillStyle = `rgba(${GLOW}, ${Math.min(1, strength * 1.4) * act[i]})`;
      ctx.beginPath();
      ctx.arc(pos[i][0], pos[i][1], 1.2 + 1.8 * act[i], 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function nearestNode(pos, x, y, maxDist) {
    let best = -1, bestD = maxDist * maxDist;
    for (let i = 0; i < pos.length; i++) {
      const d = (pos[i][0] - x) ** 2 + (pos[i][1] - y) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function pointer(canvas, e) {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  // ==== 1. Hero background ===================================================
  (function hero() {
    const canvas = document.getElementById('hero-mesh');
    if (!canvas || !canvas.getContext) return;
    const area = canvas.parentElement;
    const ctx = canvas.getContext('2d');

    // Settings
    const SPACING = 46;      // average distance between nodes, in pixels
    const HOPS = 4;          // how far a touch spreads through the graph
    const HOP_DELAY = 75;    // milliseconds between one hop and the next
    const FADE = 0.94;       // how quickly the glow fades (closer to 1 = slower)

    let W = 0, H = 0, dpr = 1, pts = [], graph = null, glow = null, still = null, running = false;

    function build() {
      const m = SPACING;   // sample beyond the edges so the mesh has no visible border
      pts = poisson(W + 2 * m, H + 2 * m, SPACING, mulberry32(20240901)).map(([x, y]) => [x - m, y - m]);
      graph = graphOf(pts.length, triangulate(pts));
      glow = makeGlow(graph.adj, HOP_DELAY, FADE);

      still = document.createElement('canvas');
      still.width = canvas.width;
      still.height = canvas.height;
      const s = still.getContext('2d');
      s.setTransform(dpr, 0, 0, dpr, 0, 0);
      s.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      s.beginPath();
      for (const [u, v] of graph.edges) { s.moveTo(pts[u][0], pts[u][1]); s.lineTo(pts[v][0], pts[v][1]); }
      s.stroke();
      s.fillStyle = 'rgba(255, 255, 255, 0.10)';
      s.beginPath();
      for (const [x, y] of pts) { s.moveTo(x + 1.2, y); s.arc(x, y, 1.2, 0, Math.PI * 2); }
      s.fill();
    }

    function frame(now) {
      const alive = glow.step(now);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(still, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawGlow(ctx, pts, graph.edges, glow.act, 0.5);
      if (alive) requestAnimationFrame(frame); else running = false;
    }

    function excite(node, hops) {
      glow.excite(node, hops);
      if (!running) { running = true; requestAnimationFrame(frame); }
    }

    function resize() {
      const r = area.getBoundingClientRect();
      const w = Math.round(r.width), h = Math.round(r.height);
      if (!w || !h || (Math.abs(w - W) < 2 && Math.abs(h - H) < 2)) return;
      W = w; H = h;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      build();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(still, 0, 0);
    }

    let timer = 0;
    const onResize = () => { clearTimeout(timer); timer = setTimeout(resize, 150); };
    if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(area);
    else window.addEventListener('resize', onResize);
    resize();

    if (reduceMotion) return;

    let last = -1;
    area.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch' || !graph) return;
      const node = nearestNode(pts, ...pointer(canvas, e), SPACING * 1.2);
      if (node >= 0 && node !== last) { last = node; excite(node, HOPS); }
    });
    area.addEventListener('pointerleave', () => { last = -1; });
    area.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' || !graph) return;
      const node = nearestNode(pts, ...pointer(canvas, e), SPACING * 1.2);
      if (node >= 0) excite(node, HOPS + 2);   // a tap sends a wider ripple
    });

    // One gentle ripple shortly after the page loads, as a hint that it is alive
    setTimeout(() => {
      const node = graph ? nearestNode(pts, W * 0.56, H * 0.62, SPACING * 1.2) : -1;
      if (node >= 0) excite(node, HOPS + 2);
    }, 900);
  })();

  // ==== 2. Von Neumann's elephant ============================================
  (function elephant() {
    const canvas = document.getElementById('vn-elephant');
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');

    // Settings
    const H_MESH = 9;          // node spacing, in the curve's own units
    const WIGGLE = 12;         // trunk tip deflection (about 0.3 × the real part of p5 = 40)
    const PERIOD = 1.4;        // seconds per wiggle
    const HOPS = 5, HOP_DELAY = 60, FADE = 0.93;

    // The five complex parameters (Mayer, Khairy & Howard, 2010)
    const p1 = [50, -30], p2 = [18, 8], p3 = [12, -10], p4 = [-14, -60], p5 = [40, 20];
    // x(t) and y(t) are short Fourier series whose coefficients are those parameters.
    // The elephant is drawn at (-y, -x): upright and facing left, towards the text.
    const curve = (t) => {
      const x = p1[0] * Math.sin(t) + p2[0] * Math.sin(2 * t) + p3[0] * Math.cos(3 * t) + p4[0] * Math.cos(5 * t);
      const y = p4[1] * Math.cos(t) + p1[1] * Math.sin(t) + p2[1] * Math.sin(2 * t) + p3[1] * Math.sin(3 * t);
      return [-y, -x];
    };
    const EYE = [-p5[1], p5[1]];   // the fifth parameter also places the eye

    // Outline: a fine polygon for inside tests, and nodes spaced H_MESH apart along it
    const fine = [];
    for (let i = 0; i < 1200; i++) fine.push(curve((2 * Math.PI * i) / 1200));
    const outline = [];
    let carry = 0;
    for (let i = 0; i < fine.length; i++) {
      const a = fine[i], b = fine[(i + 1) % fine.length];
      const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
      while (carry <= seg) {
        const f = carry / seg;
        outline.push([a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1])]);
        carry += H_MESH;
      }
      carry -= seg;
    }
    const inside = (x, y) => {
      let c = false;
      for (let i = 0, j = fine.length - 1; i < fine.length; j = i++) {
        const [xi, yi] = fine[i], [xj, yj] = fine[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
      }
      return c;
    };

    // Interior nodes: Poisson-disk points inside the outline, away from it
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of fine) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    const interior = poisson(maxX - minX, maxY - minY, H_MESH, mulberry32(1953))
      .map(([x, y]) => [x + minX, y + minY])
      .filter(([x, y]) => inside(x, y) && outline.every(([px, py]) => (px - x) ** 2 + (py - y) ** 2 > (0.6 * H_MESH) ** 2));

    const rest = outline.concat(interior);
    // Keep triangles inside the elephant, and drop slivers that bridge across gaps
    const tris = triangulate(rest).filter((t) => {
      const A = rest[t.a], B = rest[t.b], C = rest[t.c];
      const longest = Math.max(Math.hypot(A[0] - B[0], A[1] - B[1]), Math.hypot(B[0] - C[0], B[1] - C[1]), Math.hypot(C[0] - A[0], C[1] - A[1]));
      return longest < 2.1 * H_MESH && inside((A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3);
    });
    const graph = graphOf(rest.length, tris);
    const glow = makeGlow(graph.adj, HOP_DELAY, FADE);

    // Trunk: everything left of its base. It deflects like a cantilever with a tip load,
    // v(ξ) = ξ²(3 − ξ)/2, where ξ runs from 0 at the base to 1 at the tip.
    const TRUNK_BASE = -32;
    const trunkShape = rest.map(([x]) => {
      const xi = Math.min(Math.max((TRUNK_BASE - x) / (TRUNK_BASE - minX), 0), 1);
      return (xi * xi * (3 - xi)) / 2;
    });

    // ---- Drawing ----
    let W = 0, H = 0, dpr = 1, scale = 1, ox = 0, oy = 0;
    let amp = 0, phase = 0, lastT = 0, running = false;
    let hovering = false, wiggleUntil = 0;
    const pos = rest.map(() => [0, 0]);

    function layout() {
      const r = canvas.getBoundingClientRect();
      if (!r.width) return false;
      W = r.width; H = r.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      const pad = 14;
      scale = Math.min((W - 2 * pad) / (maxX - minX), (H - 2 * pad) / (maxY - minY + 2 * WIGGLE));
      ox = W / 2 - ((minX + maxX) / 2) * scale;
      oy = H / 2 + ((minY + maxY) / 2) * scale;
      return true;
    }

    function draw() {
      const dy = WIGGLE * amp * Math.sin(phase);
      for (let i = 0; i < rest.length; i++) {
        pos[i][0] = ox + rest[i][0] * scale;
        pos[i][1] = oy - (rest[i][1] + dy * trunkShape[i]) * scale;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const [u, v] of graph.edges) { ctx.moveTo(pos[u][0], pos[u][1]); ctx.lineTo(pos[v][0], pos[v][1]); }
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.beginPath();
      for (const [x, y] of pos) { ctx.moveTo(x + 1.4, y); ctx.arc(x, y, 1.4, 0, Math.PI * 2); }
      ctx.fill();

      drawGlow(ctx, pos, graph.edges, glow.act, 0.85);

      // The eye, placed by the fifth parameter
      ctx.fillStyle = `rgb(${GLOW})`;
      ctx.beginPath();
      ctx.arc(ox + EYE[0] * scale, oy - EYE[1] * scale, 3.6, 0, Math.PI * 2);
      ctx.fill();
    }

    function frame(now) {
      const dt = lastT ? Math.min((now - lastT) / 1000, 0.05) : 0;
      lastT = now;
      const target = hovering || now < wiggleUntil ? 1 : 0;
      amp += (target - amp) * Math.min(1, dt * 4);
      phase += (2 * Math.PI * dt) / PERIOD;
      const glowing = glow.step(now);
      draw();
      if (glowing || target > 0 || amp > 0.003) requestAnimationFrame(frame);
      else { running = false; lastT = 0; amp = 0; draw(); }
    }

    function start() {
      if (!running) { running = true; requestAnimationFrame(frame); }
    }

    const refit = () => { if (layout()) draw(); };
    if ('ResizeObserver' in window) new ResizeObserver(refit).observe(canvas);
    else window.addEventListener('resize', refit);
    refit();

    if (reduceMotion) return;

    const eyeNode = () => nearestNode(pos, ox + EYE[0] * scale, oy - EYE[1] * scale, 60);

    // Say hello once when the Contact section comes into view
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        setTimeout(() => {
          wiggleUntil = performance.now() + 2 * PERIOD * 1000;
          const n = eyeNode();
          if (n >= 0) glow.excite(n, HOPS + 3);
          start();
        }, 300);
      }, { threshold: 0.5 });
      io.observe(canvas);
    }

    let last = -1;
    canvas.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') { hovering = true; start(); } });
    canvas.addEventListener('pointerleave', () => { hovering = false; last = -1; });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const node = nearestNode(pos, ...pointer(canvas, e), 18);
      if (node >= 0 && node !== last) { last = node; glow.excite(node, HOPS); start(); }
    });
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      wiggleUntil = performance.now() + 2 * PERIOD * 1000;
      const node = nearestNode(pos, ...pointer(canvas, e), 30);
      if (node >= 0) glow.excite(node, HOPS + 2);
      start();
    });
  })();
})();
