/* =====================================================================
   WAR-LINE · GERADOR DE MAPAS
   Gera um mundo fictício a partir de uma semente: células de Voronoi,
   continentes, territórios, nomes, vizinhanças e rotas marítimas.
   IMPORTANTE: usa só + - * / sqrt e operações inteiras (nada de sin/cos/
   pow) para o mesmo mapa sair idêntico em qualquer navegador; assim os
   jogadores online só precisam trocar a semente.
   ===================================================================== */
(function () {
  "use strict";
  const WL = (window.WL = window.WL || {});

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  WL.rng = rng;

  function hash2(ix, iy, seed) {
    let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function vnoise(x, y, seed) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  function fbm(x, y, seed) {
    let v = 0, amp = 0.5, f = 1;
    for (let o = 0; o < 4; o++) { v += amp * vnoise(x * f, y * f, seed + o * 17); amp *= 0.5; f *= 2; }
    return v;
  }

  // Fila de prioridade mínima (heap binário) com desempate estável.
  class Heap {
    constructor() { this.a = []; this.n = 0; }
    push(p, v) {
      const a = this.a, e = [p, this.n++, v]; a.push(e); let i = a.length - 1;
      while (i > 0) { const j = (i - 1) >> 1; if (less(a[j], a[i])) break; [a[i], a[j]] = [a[j], a[i]]; i = j; }
    }
    pop() {
      const a = this.a; if (!a.length) return undefined;
      const top = a[0], last = a.pop();
      if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && less(a[l], a[m])) m = l; if (r < a.length && less(a[r], a[m])) m = r; if (m === i) break; [a[i], a[m]] = [a[m], a[i]]; i = m; } }
      return top[2];
    }
    get size() { return this.a.length; }
  }
  function less(x, y) { return x[0] < y[0] || (x[0] === y[0] && x[1] < y[1]); }

  // Recorte de polígono por semiplano, mantendo o "rótulo" (vizinho) de cada aresta.
  function clip(poly, mx, my, nx, ny, label) {
    const out = [], n = poly.length;
    for (let i = 0; i < n; i++) {
      const c = poly[i], d = poly[(i + 1) % n];
      const dc = (c.x - mx) * nx + (c.y - my) * ny, dd = (d.x - mx) * nx + (d.y - my) * ny;
      const inC = dc <= 0, inD = dd <= 0;
      if (inC) out.push(c);
      if (inC !== inD) {
        const t = dc / (dc - dd), p = { x: c.x + (d.x - c.x) * t, y: c.y + (d.y - c.y) * t };
        if (inC) { p.e = label; out.push(p); out[out.length - 2] = { x: c.x, y: c.y, e: c.e }; }
        else { p.e = c.e; out.push(p); }
      }
    }
    return out;
  }

  const SYL_A = ["Ar", "Bel", "Cor", "Dra", "El", "Fen", "Gal", "Hal", "Is", "Jor", "Kal", "Lun", "Mar", "Nor", "Or", "Pra", "Quel", "Ros", "Sal", "Tor", "Ur", "Val", "Ver", "Zan", "Bra", "Cas", "Dun", "Esm", "Gra", "Ith", "Lor", "Mor", "Ner", "Pel", "Sar", "Tal", "Vel", "Xan", "Aza", "Bor", "Cin", "Del", "Fal", "Gor", "Ilh", "Lis", "Mon", "Oss", "Rav", "Sev", "Tar", "Vor"];
  const SYL_M = ["a", "e", "i", "o", "an", "ar", "en", "il", "or", "ur", "as", "on", "al", "ir"];
  const SYL_E = ["dor", "ia", "mar", "nia", "ra", "vel", "grado", "lia", "ros", "tã", "vir", "sul", "thar", "monte", "pólis", "quia", "ena", "ora", "lândia", "fal", "brun", "cádia", "nor", "sia", "val", "rena"];
  const PREFIX = ["Porto ", "Nova ", "Cabo ", "Baía de ", "Monte ", "Vale de ", "Ilha de ", "Forte "];
  const CONT_NAMES = ["Boreália", "Austrina", "Solária", "Verdânia", "Cinzária", "Pirena", "Aquênia", "Ferrânia", "Glaciara", "Ametista", "Orientis", "Savânia", "Rubrânia", "Celéstia"];

  const SIZES = {
    P: { terr: 30, cont: 5, label: "Pequeno" },
    M: { terr: 42, cont: 6, label: "Médio" },
    G: { terr: 56, cont: 7, label: "Grande" }
  };
  WL.MAP_SIZES = SIZES;

  WL.genMap = function (seed, sizeKey) {
    const conf = SIZES[sizeKey] || SIZES.M;
    const W = 1600, H = 1000, S = 22;
    const R = rng(seed ^ 0x9e3779b9);
    const nseed = (seed * 7 + 13) | 0;
    const cols = Math.floor(W / S), rows = Math.floor(H / S), N = cols * rows;
    const sx = new Float64Array(N), sy = new Float64Array(N);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      sx[i] = (c + 0.5 + (R() - 0.5) * 0.8) * (W / cols);
      sy[i] = (r + 0.5 + (R() - 0.5) * 0.8) * (H / rows);
    }
    // --- células de Voronoi ---
    const polys = new Array(N), nb = new Array(N);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c, x = sx[i], y = sy[i];
      const x0 = Math.max(0, x - 2.2 * S), x1 = Math.min(W, x + 2.2 * S), y0 = Math.max(0, y - 2.2 * S), y1 = Math.min(H, y + 2.2 * S);
      let poly = [{ x: x0, y: y0, e: x0 === 0 ? -1 : -2 }, { x: x1, y: y0, e: x1 === W ? -1 : -2 }, { x: x1, y: y1, e: y1 === H ? -1 : -2 }, { x: x0, y: y1, e: x0 === 0 ? -1 : -2 }];
      // rótulo de cada aresta = aresta que sai do vértice: topo, direita, baixo, esquerda
      poly[0].e = y0 === 0 ? -1 : -2; poly[1].e = x1 === W ? -1 : -2; poly[2].e = y1 === H ? -1 : -2; poly[3].e = x0 === 0 ? -1 : -2;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr, cc = c + dc; if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
        const j = rr * cols + cc, mx = (x + sx[j]) / 2, my = (y + sy[j]) / 2;
        poly = clip(poly, mx, my, sx[j] - x, sy[j] - y, j);
        if (poly.length < 3) break;
      }
      polys[i] = poly;
      const set = []; for (const v of poly) if (v.e >= 0 && set.indexOf(v.e) < 0) set.push(v.e);
      nb[i] = set;
    }
    // simetriza vizinhanças
    for (let i = 0; i < N; i++) for (const j of nb[i]) if (nb[j].indexOf(i) < 0) nb[j].push(i);
    const edgeCell = new Uint8Array(N);
    for (let i = 0; i < N; i++) { const x = sx[i], y = sy[i]; if (x < 2 * S || y < 2 * S || x > W - 2 * S || y > H - 2 * S) edgeCell[i] = 1; }

    // --- continentes ---
    const C = conf.cont, centers = [];
    for (let k = 0; k < C; k++) {
      let best = null, bestD = -1;
      for (let tries = 0; tries < 80; tries++) {
        const x = 180 + R() * (W - 360), y = 160 + R() * (H - 320);
        let d = 1e9; for (const c of centers) { const dx = (c.x - x) / 1.3, dy = c.y - y; d = Math.min(d, dx * dx + dy * dy); }
        if (d > 250 * 250) { best = { x, y }; break; }
        if (d > bestD) { bestD = d; best = { x, y }; }
      }
      let ux = R() - 0.5, uy = R() - 0.5; const ul = Math.sqrt(ux * ux + uy * uy) || 1; ux /= ul; uy /= ul;
      best.ux = ux; best.uy = uy; best.st = 1 + R() * 0.8;
      centers.push(best);
    }
    const weights = centers.map(() => 0.7 + R() * 0.6), wsum = weights.reduce((a, b) => a + b, 0);
    const landTarget = Math.floor(N * 0.46);
    const target = weights.map(w => Math.floor(landTarget * w / wsum));
    const cont = new Int16Array(N).fill(-1), size = new Array(C).fill(0);
    const heaps = centers.map(() => new Heap()), radius = target.map(t => Math.sqrt(t / 3.14159) * S);
    const nearestCell = (x, y) => { let b = 0, bd = 1e18; for (let i = 0; i < N; i++) { const dx = sx[i] - x, dy = sy[i] - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; b = i; } } return b; };
    centers.forEach((c, k) => heaps[k].push(0, nearestCell(c.x, c.y)));
    const blocked = (i, k) => {
      for (const j of nb[i]) { if (cont[j] >= 0 && cont[j] !== k) return true; for (const q of nb[j]) if (cont[q] >= 0 && cont[q] !== k) return true; }
      return false;
    };
    let guard = 0;
    while (guard++ < N * 8) {
      let k = -1, bestRatio = 2;
      for (let q = 0; q < C; q++) { if (!heaps[q].size || size[q] >= target[q]) continue; const ratio = size[q] / target[q]; if (ratio < bestRatio) { bestRatio = ratio; k = q; } }
      if (k < 0) break;
      const i = heaps[k].pop();
      if (cont[i] >= 0 || edgeCell[i] || blocked(i, k)) continue;
      cont[i] = k; size[k]++;
      for (const j of nb[i]) if (cont[j] < 0 && !edgeCell[j]) {
        const ce = centers[k], dx = sx[j] - ce.x, dy = sy[j] - ce.y, al = (dx * ce.ux + dy * ce.uy) / ce.st, pe = (dy * ce.ux - dx * ce.uy) * ce.st;
        const d = Math.sqrt(al * al + pe * pe) / radius[k];
        const nz = fbm(sx[j] / 130, sy[j] / 130, nseed + k * 31);
        heaps[k].push(d * (0.25 + 1.6 * nz * nz * 1.6) + R() * 0.05, j);
      }
    }
    // preenche lagos pequenos
    const seen = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      if (cont[i] >= 0 || seen[i]) continue;
      const comp = [i], q = [i]; seen[i] = 1; let open = false;
      while (q.length) { const a = q.pop(); if (edgeCell[a]) open = true; for (const b of nb[a]) if (cont[b] < 0 && !seen[b]) { seen[b] = 1; q.push(b); comp.push(b); } }
      if (open || comp.length > 14) continue;
      const cnt = {}; for (const a of comp) for (const b of nb[a]) if (cont[b] >= 0) cnt[cont[b]] = (cnt[cont[b]] || 0) + 1;
      const ks = Object.keys(cnt); if (ks.length !== 1) continue;
      for (const a of comp) { cont[a] = Number(ks[0]); size[cont[a]]++; }
    }

    // --- territórios ---
    const T = conf.terr, landTotal = size.reduce((a, b) => a + b, 0);
    let quota = size.map(s => Math.max(3, Math.floor(T * s / landTotal)));
    let diff = T - quota.reduce((a, b) => a + b, 0);
    const order = size.map((s, k) => k).sort((a, b) => (size[b] / quota[b]) - (size[a] / quota[a]));
    for (let z = 0; diff !== 0 && z < 200; z++) {
      const k = order[z % C];
      if (diff > 0) { quota[k]++; diff--; } else if (quota[k] > 3) { quota[k]--; diff++; }
    }
    const terrOf = new Int16Array(N).fill(-1), territories = [];
    const cellsOfCont = Array.from({ length: C }, () => []);
    for (let i = 0; i < N; i++) if (cont[i] >= 0) cellsOfCont[cont[i]].push(i);
    const hop = new Int32Array(N);
    function bfs(srcs, allowed) {
      hop.fill(-1); const q = srcs.slice(); for (const s of srcs) hop[s] = 0;
      for (let h = 0; h < q.length; h++) { const a = q[h]; for (const b of nb[a]) if (hop[b] < 0 && allowed(b)) { hop[b] = hop[a] + 1; q.push(b); } }
    }
    for (let k = 0; k < C; k++) {
      const cells = cellsOfCont[k], inK = i => cont[i] === k;
      const seeds = [cells[Math.floor(R() * cells.length)]];
      bfs(seeds, inK); let far = seeds[0], fd = -1; for (const i of cells) if (hop[i] > fd) { fd = hop[i]; far = i; }
      seeds[0] = far;
      while (seeds.length < quota[k]) {
        bfs(seeds, inK); let best = cells[0], bd = -1;
        for (const i of cells) { const v = hop[i] + R() * 0.9; if (v > bd) { bd = v; best = i; } }
        seeds.push(best);
      }
      const base = territories.length, hs = seeds.map(() => new Heap()), tsz = seeds.map(() => 0);
      seeds.forEach((s, q) => { territories.push({ id: base + q, cont: k, cells: [] }); hs[q].push(0, [s, 0]); });
      let left = cells.length, g2 = 0;
      while (left > 0 && g2++ < cells.length * 20) {
        let q = -1, bs = 1e9;
        for (let z = 0; z < seeds.length; z++) if (hs[z].size && tsz[z] < bs) { bs = tsz[z]; q = z; }
        if (q < 0) break;
        const [i, d] = hs[q].pop();
        if (terrOf[i] >= 0) continue;
        terrOf[i] = base + q; tsz[q]++; left--; territories[base + q].cells.push(i);
        for (const j of nb[i]) if (cont[j] === k && terrOf[j] < 0) hs[q].push(d + 1 + R() * 1.6, [j, d + 1]);
      }
      // células órfãs (raro): vão para o vizinho
      for (const i of cells) if (terrOf[i] < 0) { const j = nb[i].find(j => terrOf[j] >= 0 && cont[j] === k); if (j !== undefined) { terrOf[i] = terrOf[j]; territories[terrOf[j]].cells.push(i); } }
    }
    // vizinhança entre territórios
    territories.forEach(t => { t.adj = []; t.sea = []; });
    for (let i = 0; i < N; i++) {
      if (terrOf[i] < 0) continue;
      for (const j of nb[i]) if (terrOf[j] >= 0 && terrOf[j] !== terrOf[i]) { const a = territories[terrOf[i]]; if (a.adj.indexOf(terrOf[j]) < 0) a.adj.push(terrOf[j]); }
    }
    // ponto do rótulo: célula mais afastada da borda do território
    territories.forEach(t => {
      const own = new Set(t.cells), border = t.cells.filter(i => nb[i].some(j => !own.has(j)) || edgeCell[i]);
      bfs(border, i => own.has(i));
      let cx = 0, cy = 0; for (const i of t.cells) { cx += sx[i]; cy += sy[i]; } cx /= t.cells.length; cy /= t.cells.length;
      let best = t.cells[0], bv = -1e9;
      for (const i of t.cells) { const dx = sx[i] - cx, dy = sy[i] - cy, v = hop[i] * 30 - Math.sqrt(dx * dx + dy * dy) * 0.25; if (v > bv) { bv = v; best = i; } }
      t.x = sx[best]; t.y = sy[best]; t.area = t.cells.length;
    });

    // --- rotas marítimas: árvore geradora mínima entre continentes + alguns atalhos ---
    const coast = []; for (let i = 0; i < N; i++) if (cont[i] >= 0 && nb[i].some(j => cont[j] < 0)) coast.push(i);
    const pairs = [];
    for (let a = 0; a < C; a++) for (let b = a + 1; b < C; b++) {
      let best = null, bd = 1e18;
      for (const i of coast) if (cont[i] === a) for (const j of coast) if (cont[j] === b) { const dx = sx[i] - sx[j], dy = sy[i] - sy[j], d = dx * dx + dy * dy; if (d < bd) { bd = d; best = [i, j]; } }
      if (best) pairs.push({ a, b, d: Math.sqrt(bd), i: best[0], j: best[1] });
    }
    pairs.sort((p, q) => p.d - q.d);
    const parent = Array.from({ length: C }, (_, k) => k), find = k => (parent[k] === k ? k : (parent[k] = find(parent[k])));
    const links = []; let maxMst = 0;
    for (const p of pairs) { const ra = find(p.a), rb = find(p.b); if (ra !== rb) { parent[ra] = rb; links.push(p); maxMst = Math.max(maxMst, p.d); } }
    let extra = 0;
    for (const p of pairs) { if (extra >= Math.max(1, C - 4)) break; if (links.indexOf(p) >= 0) continue; if (p.d < maxMst * 1.25) { links.push(p); extra++; } }
    const seaLinks = [];
    for (const p of links) {
      const ta = terrOf[p.i], tb = terrOf[p.j];
      if (territories[ta].adj.indexOf(tb) >= 0) continue;
      territories[ta].adj.push(tb); territories[tb].adj.push(ta); territories[ta].sea.push(tb); territories[tb].sea.push(ta);
      seaLinks.push({ a: ta, b: tb, x1: sx[p.i], y1: sy[p.i], x2: sx[p.j], y2: sy[p.j] });
    }

    // --- nomes ---
    const used = new Set();
    const makeName = (coastal) => {
      for (let z = 0; z < 50; z++) {
        let s = SYL_A[Math.floor(R() * SYL_A.length)] + (R() < 0.45 ? SYL_M[Math.floor(R() * SYL_M.length)] : "") + SYL_E[Math.floor(R() * SYL_E.length)];
        s = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
        if (R() < (coastal ? 0.22 : 0.08)) s = PREFIX[Math.floor(R() * PREFIX.length)] + s;
        if (s.length <= 18 && !used.has(s)) { used.add(s); return s; }
      }
      return "Território " + used.size;
    };
    territories.forEach(t => { t.name = makeName(t.cells.some(i => nb[i].some(j => cont[j] < 0))); });
    const cnames = CONT_NAMES.slice();
    for (let i = cnames.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [cnames[i], cnames[j]] = [cnames[j], cnames[i]]; }
    const HUES = [152, 6, 46, 206, 274, 24, 186, 330];
    const continents = centers.map((c, k) => {
      const terr = territories.filter(t => t.cont === k).map(t => t.id);
      const entries = terr.filter(id => territories[id].sea.length).length;
      let x = 0, y = 0, n = 0; for (const id of terr) { x += territories[id].x * territories[id].area; y += territories[id].y * territories[id].area; n += territories[id].area; }
      return { id: k, name: cnames[k], terr, bonus: Math.max(2, Math.round(terr.length * 0.45 + entries * 0.75 - 1)), hue: HUES[k % HUES.length], x: x / n, y: y / n };
    });

    // --- geometria para desenhar ---
    const r1 = v => Math.round(v * 10) / 10;
    territories.forEach(t => {
      t.path = t.cells.map(i => "M" + polys[i].map(v => r1(v.x) + " " + r1(v.y)).join("L") + "Z").join("");
    });
    let borders = "", coastPath = "", contBorders = "";
    for (let i = 0; i < N; i++) {
      const p = polys[i]; if (cont[i] < 0) continue;
      for (let k = 0; k < p.length; k++) {
        const v = p[k], w = p[(k + 1) % p.length], j = v.e;
        const seg = "M" + r1(v.x) + " " + r1(v.y) + "L" + r1(w.x) + " " + r1(w.y);
        if (j < 0 || cont[j] < 0) coastPath += seg;
        else if (j > i && terrOf[j] !== terrOf[i]) borders += seg;
      }
    }
    return { seed, size: sizeKey, W, H, territories, continents, seaLinks, borders, coast: coastPath, contBorders,
      cellOf: { sx, sy, cols, rows, terrOf, S: W / cols, SH: H / rows } };
  };

  // Território sob um ponto (célula de Voronoi = semente mais próxima).
  WL.terrAt = function (map, x, y) {
    const c = map.cellOf, col = Math.floor(x / c.S), row = Math.floor(y / c.SH);
    let best = -1, bd = 1e18;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      const r = row + dr, cc = col + dc; if (r < 0 || cc < 0 || r >= c.rows || cc >= c.cols) continue;
      const i = r * c.cols + cc, dx = c.sx[i] - x, dy = c.sy[i] - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    return best < 0 ? -1 : c.terrOf[best];
  };
})();
