/* =====================================================================
   WAR-LINE · INTERFACE
   Menu, mapa em SVG (zoom/arraste), fases do turno, combate, cartas,
   painéis e sons. Também é aqui que o "anfitrião" roda o motor e as CPUs.
   ===================================================================== */
(function () {
  "use strict";
  const WL = window.WL;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const NS = "http://www.w3.org/2000/svg";
  const store = {
    get(k, d) { try { const v = localStorage.getItem("wl6:" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("wl6:" + k, JSON.stringify(v)); } catch (e) { } }
  };
  const col = c => WL.COLORS[c] ? WL.COLORS[c].hex : "#888";
  function mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t), g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t), bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
  }
  function hsl2hex(h, s, l) {
    s /= 100; l /= 100; const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = n => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
    return "#" + ((1 << 24) + (f(0) << 16) + (f(8) << 8) + f(4)).toString(16).slice(1);
  }

  /* ---------------- sons ---------------- */
  const SND = {
    on: store.get("sound", true), ctx: null,
    ac() { if (!this.on) return null; if (!this.ctx) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; try { this.ctx = new A(); } catch (e) { return null; } } if (this.ctx.state === "suspended") this.ctx.resume(); return this.ctx; },
    tone(f, d, type, v, when, to) { const c = this.ac(); if (!c) return; const t = c.currentTime + (when || 0), o = c.createOscillator(), g = c.createGain(); o.type = type || "sine"; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + d); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(v || .12, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + d); o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + d + .05); },
    noise(d, f, v, when, type) { const c = this.ac(); if (!c) return; const t = c.currentTime + (when || 0), len = Math.floor(c.sampleRate * d), b = c.createBuffer(1, len, c.sampleRate), x = b.getChannelData(0); for (let i = 0; i < len; i++) x[i] = (Math.random() * 2 - 1) * (1 - i / len); const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain(); s.buffer = b; fl.type = type || "lowpass"; fl.frequency.value = f; g.gain.value = v; s.connect(fl); fl.connect(g); g.connect(c.destination); s.start(t); },
    click() { this.tone(900, .05, "triangle", .05); },
    place() { this.tone(520, .07, "square", .05); this.tone(780, .06, "square", .04, .05); },
    dice() { for (let i = 0; i < 5; i++) this.noise(.04, 3000, .12, i * .06, "highpass"); },
    boom() { this.noise(.5, 500, .5); this.tone(70, .45, "sawtooth", .12, 0, 35); },
    conquer() { [440, 554, 659, 880].forEach((f, i) => this.tone(f, .16, "triangle", .1, i * .08)); },
    turn() { this.tone(660, .12, "sine", .12); this.tone(990, .2, "sine", .1, .12); },
    err() { this.tone(180, .18, "square", .06); },
    move() { this.tone(330, .15, "triangle", .07, 0, 520); },
    win() { [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, .3, "triangle", .12, i * .13)); },
    lose() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, .35, "triangle", .1, i * .22)); },
    chat() { this.tone(1200, .06, "sine", .05); }
  };
  WL.SND = SND;
  function syncSound() { ["m-sound", "g-sound"].forEach(id => { const b = $(id); b.textContent = SND.on ? "🔊" : "🔇"; b.classList.toggle("off", !SND.on); }); }
  ["m-sound", "g-sound"].forEach(id => $(id).addEventListener("click", () => { SND.on = !SND.on; store.set("sound", SND.on); syncSound(); SND.click(); }));
  syncSound();

  /* ---------------- modais e avisos ---------------- */
  document.querySelectorAll(".modal").forEach(m => m.addEventListener("click", e => { if (e.target === m || e.target.closest("[data-close]")) m.hidden = true; }));
  const openModal = id => { $(id).hidden = false; };
  $("m-help").onclick = () => openModal("m-howto");
  $("g-help").onclick = () => openModal("m-howto");
  let toastT = 0;
  function toast(msg, info) { const t = $("toast"); t.textContent = msg; t.className = "toast" + (info ? " info" : ""); t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, info ? 2600 : 3200); if (!info) SND.err(); }
  WL.toast = toast;
  function feed(text, c) { const f = $("feed"), d = document.createElement("div"); d.textContent = text; if (c) d.style.setProperty("--c", c); f.appendChild(d); while (f.children.length > 5) f.firstChild.remove(); setTimeout(() => d.remove(), 5000); }

  /* =====================================================================
     MENU
     ===================================================================== */
  const CPU_NAMES = ["Gen. Vidal", "Cel. Ayla", "Maj. Brutus", "Alm. Nara", "Cap. Ilsen", "Mar. Torres", "Gen. Okon", "Cel. Rhea", "Maj. Sombra", "Alm. Kruger"];
  const menuCfg = Object.assign({ name: "", players: 4, diff: "normal", color: 0, size: "M", seed: randSeed(), timer: 90, speed: "normal", missions: true, alliances: true }, store.get("cfg", {}));
  function randSeed() { return 100000 + Math.floor(Math.random() * 899999); }
  WL.menuCfg = menuCfg;
  function initMenu() {
    $("cfg-name").value = menuCfg.name; $("cfg-players").value = menuCfg.players; $("cfg-diff").value = menuCfg.diff; $("cfg-size").value = menuCfg.size;
    $("cfg-seed").value = menuCfg.seed; $("cfg-timer").value = menuCfg.timer; $("cfg-speed").value = menuCfg.speed;
    $("cfg-missions").checked = menuCfg.missions; $("cfg-alliances").checked = menuCfg.alliances;
    renderColors();
    const save = () => { readMenu(); store.set("cfg", menuCfg); };
    ["cfg-name", "cfg-players", "cfg-diff", "cfg-timer", "cfg-speed", "cfg-missions", "cfg-alliances"].forEach(id => $(id).addEventListener("change", save));
    $("cfg-name").addEventListener("input", save);
    $("cfg-size").addEventListener("change", () => { save(); renderPreview(); });
    $("cfg-seed").addEventListener("input", () => { clearTimeout(renderPreview.t); renderPreview.t = setTimeout(() => { save(); renderPreview(); }, 350); });
    $("cfg-reseed").onclick = () => { $("cfg-seed").value = randSeed(); save(); renderPreview(); SND.click(); };
    renderPreview();
    const q = new URLSearchParams(location.search).get("sala");
    if (q) $("join-code").value = q.toUpperCase().slice(0, 6);
  }
  function renderColors() {
    $("cfg-color").innerHTML = WL.COLORS.map((c, i) => `<button style="--c:${c.hex}" data-c="${i}" class="${menuCfg.color === i ? "on" : ""}" title="${c.name}" aria-label="${c.name}"></button>`).join("");
    $("cfg-color").querySelectorAll("button").forEach(b => b.onclick = () => { menuCfg.color = Number(b.dataset.c); store.set("cfg", menuCfg); renderColors(); SND.click(); });
  }
  function readMenu() {
    menuCfg.name = $("cfg-name").value.trim().slice(0, 16);
    menuCfg.players = Number($("cfg-players").value); menuCfg.diff = $("cfg-diff").value; menuCfg.size = $("cfg-size").value;
    const sd = parseInt($("cfg-seed").value, 10); menuCfg.seed = isFinite(sd) && sd > 0 ? sd % 1000000000 : randSeed();
    menuCfg.timer = Number($("cfg-timer").value); menuCfg.speed = $("cfg-speed").value;
    menuCfg.missions = $("cfg-missions").checked; menuCfg.alliances = $("cfg-alliances").checked;
    return menuCfg;
  }
  WL.readMenu = readMenu;
  function renderPreview() {
    readMenu();
    const m = WL.genMap(menuCfg.seed, menuCfg.size), svg = $("preview");
    let h = `<defs><pattern id="pg" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="rgba(0,229,255,.07)"/></pattern></defs><rect width="1600" height="1000" fill="url(#pg)"/>`;
    h += `<path d="${m.coast}" stroke="rgba(0,160,255,.25)" stroke-width="16" fill="none" stroke-linejoin="round"/>`;
    m.seaLinks.forEach(l => { h += `<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" stroke="rgba(170,215,255,.6)" stroke-width="3" stroke-dasharray="8 8"/>`; });
    m.territories.forEach((t, i) => { const c = hsl2hex(m.continents[t.cont].hue, 45, 30 + (i % 3) * 5); h += `<path d="${t.path}" fill="${c}" stroke="${c}" stroke-width="1.2"/>`; });
    h += `<path d="${m.borders}" stroke="rgba(4,10,24,.6)" stroke-width="2" fill="none"/><path d="${m.coast}" stroke="rgba(140,210,255,.9)" stroke-width="2.5" fill="none"/>`;
    m.continents.forEach(c => { h += `<text x="${c.x}" y="${c.y}" fill="rgba(255,255,255,.75)" font-size="38" font-family="Oxanium,sans-serif" font-weight="800" text-anchor="middle" letter-spacing="4">${esc(c.name.toUpperCase())}</text>`; });
    svg.innerHTML = h;
    $("prev-name").textContent = "SEMENTE " + menuCfg.seed;
    $("prev-legend").innerHTML = m.continents.map(c => `<span>${esc(c.name)} <b>+${c.bonus}</b> · ${c.terr.length} terr.</span>`).join("");
  }

  $("btn-solo").onclick = () => {
    readMenu(); store.set("cfg", menuCfg); SND.click();
    const n = menuCfg.players, seats = [{ name: menuCfg.name || "Comandante", color: menuCfg.color, human: true }];
    const free = [0, 1, 2, 3, 4, 5].filter(c => c !== menuCfg.color), names = CPU_NAMES.slice().sort(() => Math.random() - .5);
    for (let i = 1; i < n; i++) seats.push({ name: names[i], color: free[i - 1], human: false, diff: menuCfg.diff === "mix" ? ["easy", "normal", "hard"][i % 3] : menuCfg.diff });
    WL.NET && WL.NET.reset && WL.NET.reset();
    startHosted({ seed: menuCfg.seed, size: menuCfg.size, seats, cfg: cfgFromMenu() }, 0, "solo");
  };
  function cfgFromMenu() { return { missions: menuCfg.missions, alliances: menuCfg.alliances, timer: menuCfg.timer, speed: menuCfg.speed }; }
  WL.cfgFromMenu = cfgFromMenu;
  WL.CPU_NAMES = CPU_NAMES;

  /* =====================================================================
     ANFITRIÃO (solo ou dono da sala): roda o motor e as CPUs
     ===================================================================== */
  const G = (WL.G = { S: null, view: null, map: null, me: 0, mode: "solo", aiT: 0, tick: 0, conf: null });
  function startHosted(conf, meSeat, mode) {
    stopGame();
    G.mode = mode; G.me = meSeat; G.conf = conf;
    G.S = WL.createGame(conf);
    enterGame(G.S.map);
    afterChange();
    G.tick = setInterval(hostTick, 500);
  }
  WL.startHosted = startHosted;
  function stopGame() { clearTimeout(G.aiT); clearInterval(G.tick); G.S = null; G.view = null; }
  WL.stopGame = stopGame;
  function hostExec(p, cmd) {
    const S = G.S; if (!S) return;
    const err = WL.exec(S, p, cmd);
    if (err) { if (p === G.me) toast(err); else WL.NET && WL.NET.sendTo(p, { k: "err", text: err }); return; }
    afterChange();
  }
  WL.hostExec = hostExec;
  function afterChange() {
    broadcast(); scheduleAI(); cpuDiplomacy();
  }
  WL.afterChange = afterChange;
  function broadcast() {
    const S = G.S; if (!S) return;
    const ev = S.events || []; S.events = [];
    S.players.forEach((pl, i) => {
      if (!pl.human && i !== G.me) return;
      const v = WL.viewFor(S, i); v.left = S.deadline ? S.deadline - Date.now() : 0;
      if (i === G.me) onState(v, ev); else WL.NET && WL.NET.sendTo(i, { k: "state", v, ev });
    });
  }
  WL.broadcast = broadcast;
  const SPEED = { slow: 1100, normal: 620, fast: 240, instant: 15 };
  function scheduleAI() {
    const S = G.S; clearTimeout(G.aiT);
    if (!S || S.winner != null) return;
    const cur = S.players[S.cur]; if (cur.human) return;
    const base = SPEED[S.cfg.speed] || 620;
    const d = S.phase === "deploy" || S.phase === "reinforce" ? base * .45 : S.pending ? base * .5 : base;
    G.aiT = setTimeout(aiTick, d);
  }
  function aiTick() {
    const S = G.S; if (!S || S.winner != null || S.players[S.cur].human) return;
    const p = S.cur, cmd = WL.aiStep(S);
    let err = WL.exec(S, p, cmd);
    if (err) { for (const k of ["toAttack", "toFortify", "end"]) { if (!WL.exec(S, p, { k })) { err = null; break; } } if (err) WL.autoFinish(S); }
    afterChange();
  }
  function hostTick() {
    const S = G.S; if (!S || S.winner != null) return;
    if (S.deadline && Date.now() > S.deadline && S.players[S.cur].human) {
      const who = S.players[S.cur].name;
      WL.autoFinish(S); S.log.push({ text: `⏱ Tempo esgotado para ${who}.`, to: -1, seq: ++S.seq });
      afterChange();
    }
  }
  // CPUs respondem e às vezes propõem alianças
  const CPU_LINES = ["Recebido.", "Hmm… vou pensar.", "Não confio em ninguém neste mapa.", "Interessante. Veremos.", "Boa sorte no próximo turno.", "Cuidado com as suas fronteiras.", "Quer paz? Proponha uma aliança.", "Estou de olho em você.", "Minhas tropas estão prontas.", "Isso é uma ameaça?"];
  WL.CPU_LINES = CPU_LINES;
  function cpuDiplomacy() {
    const S = G.S; if (!S || !S.cfg.alliances || S.winner != null) return;
    (S.allyReq || []).forEach(r => {
      if (S.players[r.to].human || r.handled) return; r.handled = true;
      setTimeout(() => { if (!G.S || G.S !== S) return; const yes = WL.aiAllyAnswer(S, r.to, r.from); WL.exec(S, r.to, { k: "allyAnswer", to: r.from, yes }); afterChange(); }, 1500 + Math.random() * 2500);
    });
    const cur = S.players[S.cur];
    if (!cur.human && S.phase === "reinforce" && S.placed.length === 0 && S.lastDip !== S.cur + ":" + S.round) {
      S.lastDip = S.cur + ":" + S.round;
      if (S.round >= 2 && Math.random() < .07 && WL.allyOf(S, S.cur) == null) {
        const opts = S.players.filter(x => x.alive && x.id !== S.cur && WL.allyOf(S, x.id) == null);
        if (opts.length) WL.exec(S, S.cur, { k: "ally", to: opts[Math.floor(Math.random() * opts.length)].id });
      }
      const a = WL.allyOf(S, S.cur);
      if (a != null && Math.random() < .05) WL.exec(S, S.cur, { k: "allyBreak" });
    }
  }

  /* ---------------- ponte local ↔ rede ---------------- */
  function act(cmd) {
    if (G.mode === "client") { WL.NET.sendCmd(cmd); return; }
    hostExec(G.me, cmd);
  }
  WL.act = act;

  /* =====================================================================
     MAPA (SVG)
     ===================================================================== */
  const svg = $("map");
  const vb = { x: 0, y: 0, w: 1600, h: 1000 };
  let terrEls = [], mkEls = [], nameEls = [], baseCols = [];
  const U = { sel: null, target: null, amount: 1, cards: [], showMis: false, combat: null, hover: -1, contHl: null, names: store.get("names", true) };
  WL.U = U;

  function el(tag, attrs, parent) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }

  function enterGame(map) {
    G.map = map;
    $("menu").hidden = true; $("game").hidden = false;
    U.sel = U.target = null; U.cards = []; U.showMis = false; U.combat = null;
    $("log").innerHTML = ""; $("chat").innerHTML = ""; $("feed").innerHTML = ""; $("combat").hidden = true; $("m-win").hidden = true;
    WL.chatLog = [];
    buildMap(map);
    fit();
    setTab("cmd");
    $("room-tag").textContent = G.mode === "solo" ? "" : "SALA " + (WL.NET.code || "");
  }
  WL.enterGame = enterGame;

  function buildMap(map) {
    svg.innerHTML = "";
    svg.classList.toggle("nonames", !U.names);
    const defs = el("defs", {}, svg);
    defs.innerHTML = `<filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <filter id="soft"><feGaussianBlur stdDeviation="6"/></filter>
      <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M50 0H0V50" fill="none" stroke="rgba(0,229,255,.06)" stroke-width="1"/></pattern>
      <pattern id="hatch" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(40)"><line x1="0" y1="0" x2="0" y2="9" stroke="rgba(255,255,255,.06)" stroke-width="2.5"/></pattern>
      <radialGradient id="oc" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#0c2048"/><stop offset="1" stop-color="#050b1c"/></radialGradient>`;
    el("rect", { x: -1600, y: -1000, width: 4800, height: 3000, fill: "url(#oc)" }, svg);
    el("rect", { x: -1600, y: -1000, width: 4800, height: 3000, fill: "url(#grid)" }, svg);
    el("path", { d: map.coast, stroke: "rgba(40,140,255,.22)", "stroke-width": 26, fill: "none", "stroke-linejoin": "round", "stroke-linecap": "round", filter: "url(#soft)" }, svg);
    el("path", { d: map.coast, stroke: "rgba(60,160,255,.18)", "stroke-width": 9, fill: "none", "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
    const gSea = el("g", {}, svg);
    map.seaLinks.forEach(l => {
      const mx = (l.x1 + l.x2) / 2, my = (l.y1 + l.y2) / 2, dx = l.x2 - l.x1, dy = l.y2 - l.y1, L = Math.sqrt(dx * dx + dy * dy) || 1;
      const cx = mx - dy / L * L * .18, cy = my + dx / L * L * .18;
      el("path", { class: "sea", d: `M${l.x1} ${l.y1}Q${cx} ${cy} ${l.x2} ${l.y2}` }, gSea);
      el("circle", { cx: l.x1, cy: l.y1, r: 4, fill: "rgba(170,215,255,.8)" }, gSea); el("circle", { cx: l.x2, cy: l.y2, r: 4, fill: "rgba(170,215,255,.8)" }, gSea);
    });
    const gT = el("g", {}, svg);
    baseCols = map.territories.map((t, i) => hsl2hex(map.continents[t.cont].hue, 28, 20 + (i % 3) * 3));
    terrEls = map.territories.map((t, i) => el("path", { d: t.path, class: "terr", "data-t": i, fill: baseCols[i], stroke: baseCols[i], "stroke-width": 1.2, "stroke-linejoin": "round" }, gT));
    el("path", { d: map.territories.map(t => t.path).join(""), fill: "url(#hatch)", "pointer-events": "none" }, svg);
    el("path", { d: map.borders, stroke: "rgba(3,8,22,.78)", "stroke-width": 2.4, fill: "none", "stroke-linecap": "round", "pointer-events": "none" }, svg);
    el("path", { d: map.coast, stroke: "rgba(150,215,255,.85)", "stroke-width": 2.2, fill: "none", "stroke-linecap": "round", "pointer-events": "none", filter: "url(#glow)" }, svg);
    const gC = el("g", {}, svg);
    map.continents.forEach(c => { const t = el("text", { x: c.x, y: c.y - 40, class: "cname", "text-anchor": "middle" }, gC); t.textContent = c.name; });
    G.gHl = el("g", {}, svg);
    const gN = el("g", {}, svg);
    nameEls = map.territories.map(t => { const n = el("text", { x: t.x, y: t.y + 32, class: "tname", "text-anchor": "middle" }, gN); n.textContent = t.name; return n; });
    const gM = el("g", {}, svg);
    mkEls = map.territories.map((t, i) => {
      const g = el("g", { class: "mk", transform: `translate(${t.x} ${t.y})` }, gM);
      const glow = el("circle", { r: 20, fill: "transparent", opacity: .0, class: "mglow" }, g);
      const ring = el("circle", { r: 15, class: "ring", fill: "#0a1226", stroke: "#888", "stroke-width": 3.5 }, g);
      const txt = el("text", { y: 5.5, "text-anchor": "middle", "font-size": 15, fill: "#fff" }, g); txt.textContent = "1";
      return { g, ring, txt, glow, last: -1 };
    });
    G.gFx = el("g", {}, svg);
    applyVB();
  }

  function applyVB() { svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`); }
  function fit() {
    const r = svg.getBoundingClientRect(), ar = r.width / Math.max(1, r.height);
    let x0 = 1600, y0 = 1000, x1 = 0, y1 = 0;
    if (G.map) G.map.territories.forEach(t => { x0 = Math.min(x0, t.x); y0 = Math.min(y0, t.y); x1 = Math.max(x1, t.x); y1 = Math.max(y1, t.y); });
    else { x0 = 100; y0 = 100; x1 = 1500; y1 = 900; }
    x0 -= 110; y0 -= 110; x1 += 110; y1 += 120;
    let w = x1 - x0, h = y1 - y0; const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    if (ar < .9) w *= .72; // celular em pé: começa mais perto (arraste para ver o resto)
    if (w / h < ar) w = h * ar; else h = w / ar;
    vb.w = w; vb.h = h; vb.x = cx - w / 2; vb.y = cy - h / 2; applyVB();
  }
  function toSvg(cx, cy) { const p = svg.createSVGPoint(); p.x = cx; p.y = cy; const m = svg.getScreenCTM(); return m ? p.matrixTransform(m.inverse()) : { x: 0, y: 0 }; }
  function zoomAt(cx, cy, f) {
    const p = toSvg(cx, cy), nw = Math.max(320, Math.min(2400, vb.w * f)), k = nw / vb.w;
    vb.x = p.x - (p.x - vb.x) * k; vb.y = p.y - (p.y - vb.y) * k; vb.w = nw; vb.h *= k; clampVB(); applyVB();
  }
  function clampVB() { vb.x = Math.max(-800, Math.min(1600 - vb.w * .2, vb.x)); vb.y = Math.max(-600, Math.min(1000 - vb.h * .2, vb.y)); }
  window.addEventListener("resize", () => { if (!$("game").hidden) { const cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2, r = svg.getBoundingClientRect(), ar = r.width / Math.max(1, r.height); vb.h = vb.w / ar; vb.x = cx - vb.w / 2; vb.y = cy - vb.h / 2; applyVB(); } });
  $("z-in").onclick = () => { const r = svg.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, .75); };
  $("z-out").onclick = () => { const r = svg.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.33); };
  $("z-fit").onclick = fit;
  $("z-names").onclick = () => { U.names = !U.names; store.set("names", U.names); svg.classList.toggle("nonames", !U.names); };
  svg.addEventListener("wheel", e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, e.deltaY > 0 ? 1.15 : 1 / 1.15); }, { passive: false });

  // arrastar, pinça e clique
  const ptrs = new Map(); let drag = null;
  svg.addEventListener("pointerdown", e => {
    try { svg.setPointerCapture(e.pointerId); } catch (err) { }
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) { const r = svg.getBoundingClientRect(); drag = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y, k: vb.w / r.width, moved: false }; }
    else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; drag = { pinch: Math.hypot(a.x - b.x, a.y - b.y), moved: true }; }
  });
  svg.addEventListener("pointermove", e => {
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (drag && drag.pinch && ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 0) { zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, drag.pinch / d); drag.pinch = d; } return;
    }
    if (drag && ptrs.size === 1) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 6) { drag.moved = true; svg.classList.add("dragging"); hideTip(); }
      if (drag.moved) { vb.x = drag.vx - dx * drag.k; vb.y = drag.vy - dy * drag.k; clampVB(); applyVB(); }
      return;
    }
    if (e.pointerType === "mouse") hover(e);
  });
  const endPtr = e => {
    const wasDrag = drag && drag.moved;
    ptrs.delete(e.pointerId);
    if (ptrs.size === 0) {
      svg.classList.remove("dragging");
      if (drag && !wasDrag && e.type === "pointerup") { const p = toSvg(e.clientX, e.clientY); const t = WL.terrAt(G.map, p.x, p.y); onTerrClick(t, e); }
      drag = null;
    }
  };
  svg.addEventListener("pointerup", endPtr);
  svg.addEventListener("pointercancel", endPtr);
  svg.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") hideTip(); });
  svg.addEventListener("contextmenu", e => { e.preventDefault(); const p = toSvg(e.clientX, e.clientY); const t = WL.terrAt(G.map, p.x, p.y); if (t >= 0) onTerrClick(t, e, true); });

  function hover(e) {
    if (!G.map || !G.view) return;
    const p = toSvg(e.clientX, e.clientY), t = WL.terrAt(G.map, p.x, p.y);
    if (t !== U.hover) { U.hover = t; drawHl(); }
    if (t < 0) { hideTip(); return; }
    const v = G.view, T = G.map.territories[t], o = v.own[t], c = G.map.continents[T.cont];
    const tip = $("tip");
    tip.innerHTML = `<b style="color:${col(v.players[o].color)}">${esc(T.name)}</b><div class="tp-row"><span>Continente</span><span>${esc(c.name)} (+${c.bonus})</span></div>
      <div class="tp-row"><span>Dono</span><span>${esc(v.players[o].name)}</span></div><div class="tp-row"><span>Tropas</span><span>${v.troops[t]}</span></div>
      ${T.sea.length ? `<div class="tp-row"><span>Rota marítima</span><span>${T.sea.map(s => esc(G.map.territories[s].name)).join(", ")}</span></div>` : ""}
      ${hintFor(t)}`;
    const r = $("mapwrap").getBoundingClientRect();
    let x = e.clientX - r.left + 16, y = e.clientY - r.top + 16;
    tip.hidden = false;
    if (x + tip.offsetWidth > r.width - 8) x = e.clientX - r.left - tip.offsetWidth - 16;
    if (y + tip.offsetHeight > r.height - 8) y = e.clientY - r.top - tip.offsetHeight - 16;
    tip.style.left = x + "px"; tip.style.top = y + "px";
  }
  function hideTip() { $("tip").hidden = true; if (U.hover !== -1) { U.hover = -1; drawHl(); } }
  function hintFor(t) {
    const v = G.view; if (!myTurn()) return "";
    const mine = v.own[t] === v.me;
    if ((v.phase === "reinforce" || v.phase === "deploy") && mine) return `<div class="tp-row"><span>Clique</span><span>+${amountFor(t)} tropa(s)</span></div>`;
    if (v.phase === "attack" && U.sel != null && !mine && G.map.territories[U.sel].adj.indexOf(t) >= 0) {
      const p = WL.winProb(v.troops[U.sel] - 1, v.troops[t]);
      return `<div class="tp-row"><span>Chance de conquista</span><span>${Math.round(p * 100)}%</span></div>`;
    }
    return "";
  }

  /* ---------------- estado vindo do anfitrião ---------------- */
  function myTurn() { const v = G.view; return v && v.winner == null && v.cur === v.me && v.players[v.me].alive; }
  WL.onState = onState;
  function onState(v, ev) {
    const prev = G.view; G.view = v;
    if (v.left) G.deadline = Date.now() + v.left; else G.deadline = 0;
    // validações de seleção
    if (!myTurn() || (prev && (prev.phase !== v.phase || prev.cur !== v.cur))) { U.sel = U.target = null; if (!(U.combat && U.combat.res && v.cur === v.me && v.phase === "attack")) closeCombat(); }
    if (U.sel != null && v.own[U.sel] !== v.me) U.sel = null;
    U.cards = U.cards.filter(i => i < v.cards.length);
    render();
    (ev || []).forEach(e => handleEvent(e, v, prev));
  }

  function handleEvent(e, v, prev) {
    const P = v.players, T = G.map.territories;
    switch (e.k) {
      case "place": floatText(e.t, (e.n > 0 ? "+" : "") + e.n, e.n > 0 ? "#36e28a" : "#ff8c97"); if (e.p === v.me) SND.place(); else if (Math.random() < .5) SND.click(); pulse(e.t); break;
      case "combat": {
        arrow(e.from, e.to, col(P[e.p].color));
        if (e.la) setTimeout(() => floatText(e.from, "−" + e.la, "#ff8c97"), 150);
        if (e.ld) setTimeout(() => floatText(e.to, "−" + e.ld, "#ff8c97"), 250);
        SND.dice(); setTimeout(() => (e.la + e.ld > 2 ? SND.boom() : SND.noise(.2, 800, .3)), 300);
        if (e.p === v.me && U.combat && U.combat.from === e.from && U.combat.to === e.to) { U.combat.res = e; renderCombat(true); }
        else if (e.def === v.me) feed(`${P[e.p].name} atacou ${T[e.to].name}: você perdeu ${e.ld}, ele perdeu ${e.la}.`, col(P[e.p].color));
        if (e.conquered) { setTimeout(() => SND.conquer(), 450); ring(e.to, col(P[e.p].color)); if (e.p !== v.me) feed(`${P[e.p].name} conquistou ${T[e.to].name}.`, col(P[e.p].color)); }
        break;
      }
      case "move": arrow(e.from, e.to, "#00e5ff"); floatText(e.to, "+" + e.n, "#00e5ff"); SND.move(); break;
      case "turn":
        if (e.p === v.me) { SND.turn(); feed(e.phase === "deploy" ? "Sua vez: posicione as tropas iniciais." : "Sua vez! Reforce seus territórios.", "#00e5ff"); if (document.hidden) document.title = "▶ Sua vez · WAR-LINE"; }
        break;
      case "trade": feed(`${P[e.p].name} trocou cartas por ${e.val} tropas.`, col(P[e.p].color)); if (e.p === v.me) { SND.conquer(); e.bonus.forEach(t => floatText(t, "+2", "#ffd23f")); } break;
      case "card": if (e.p === v.me) feed("Você recebeu uma carta de território.", "#ffd23f"); break;
      case "elim": feed(`☠ ${P[e.p].name} foi eliminado por ${P[e.by].name}!`, col(P[e.p].color)); SND.boom(); if (e.p === v.me) toast("Você foi eliminado. Continue assistindo ou volte ao menu.", true); break;
      case "allyReq": if (e.to === v.me) { feed(`🤝 ${P[e.from].name} propôs uma aliança secreta (aba Social).`, "#ffd23f"); badge(); SND.chat(); } break;
      case "win": setTimeout(showWin, 900); break;
    }
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) document.title = "WAR-LINE"; });

  /* ---------------- desenho do estado ---------------- */
  function render() {
    const v = G.view, map = G.map; if (!v || !map) return;
    const P = v.players;
    for (let i = 0; i < terrEls.length; i++) {
      const o = v.own[i], c = mix(col(P[o].color), baseCols[i], .42);
      if (terrEls[i]._c !== c) { terrEls[i].setAttribute("fill", c); terrEls[i].setAttribute("stroke", c); terrEls[i]._c = c; }
      const m = mkEls[i], n = v.troops[i];
      if (m.last !== n) { m.txt.textContent = n; const r = n >= 100 ? 21 : n >= 10 ? 17 : 15; m.ring.setAttribute("r", r); m.txt.setAttribute("font-size", n >= 100 ? 14 : 15); m.last = n; }
      m.ring.setAttribute("stroke", col(P[o].color));
    }
    renderHud(); renderAction(); renderSide(); drawHl();
    if (U.combat) renderCombat(false);
    if (v.winner != null && !$("m-win").dataset.shown) { /* mostrado pelo evento */ }
  }

  function drawHl() {
    const g = G.gHl; if (!g || !G.view) return;
    g.innerHTML = "";
    const v = G.view, T = G.map.territories;
    const add = (t, cls, stroke) => el("path", { d: T[t].path, class: cls, stroke: stroke || "#fff" }, g);
    let dimSet = null;
    if (U.contHl != null) { G.map.continents[U.contHl].terr.forEach(t => add(t, "hl-target", "#ffd23f")); }
    if (myTurn() && U.sel != null) {
      add(U.sel, "hl-sel");
      if (v.phase === "attack") { const tg = attackTargets(U.sel); tg.forEach(t => add(t, "hl-target", U.target === t ? "#fff" : "#ff4b5c")); dimSet = new Set([U.sel, ...tg]); }
      if (v.phase === "fortify") { const r = WL.reachable(fakeS(), U.sel); r.forEach(t => add(t, "hl-target", "#00e5ff")); dimSet = new Set([U.sel, ...r]); }
    }
    terrEls.forEach((e, i) => e.classList.toggle("dim", !!dimSet && !dimSet.has(i)));
    if (U.hover >= 0) add(U.hover, "hl-hover");
  }
  function fakeS() { return { own: G.view.own, map: G.map, allies: [] }; }
  function attackTargets(a) {
    const v = G.view; return G.map.territories[a].adj.filter(t => v.own[t] !== v.me && v.own[t] !== v.ally);
  }

  function renderHud() {
    const v = G.view, cur = v.players[v.cur];
    const phaseTxt = { deploy: "posicionamento inicial", reinforce: "reforçando", attack: "atacando", fortify: "remanejando", over: "fim de jogo" }[v.phase];
    $("turn").innerHTML = v.winner != null ? `<i style="color:${col(v.players[v.winner].color)};background:${col(v.players[v.winner].color)}"></i><span>${esc(v.players[v.winner].name)} venceu!</span>`
      : `<i style="color:${col(cur.color)};background:${col(cur.color)}"></i><span>${v.cur === v.me ? "Sua vez" : esc(cur.name)}</span><small>${phaseTxt} · rodada ${Math.max(1, v.round)}</small>`;
    const ph = $("phases"); ph.classList.toggle("deploy", v.phase === "deploy");
    const order = ["reinforce", "attack", "fortify"], idx = order.indexOf(v.phase);
    ph.querySelectorAll("li").forEach((li, i) => { li.classList.toggle("on", i === idx); li.classList.toggle("done", idx > i); });
  }
  setInterval(() => {
    const t = $("timer"); if (!G.view || !G.deadline || G.view.winner != null) { t.hidden = true; return; }
    const s = Math.max(0, Math.ceil((G.deadline - Date.now()) / 1000)); t.hidden = false; t.textContent = "⏱ " + s + "s"; t.classList.toggle("low", s <= 10);
  }, 250);

  function amountFor(t) {
    const v = G.view, r = v.reserve, c = G.map.territories[t].cont, avail = r.free + (r.cont[c] || 0);
    return Math.max(0, Math.min(avail, U.amount === "all" ? avail : U.amount));
  }
  function totalRes() { const r = G.view.reserve; return r.free + Object.values(r.cont).reduce((a, b) => a + b, 0); }

  function renderAction() {
    const v = G.view, bar = $("actionbar");
    if (v.winner != null) { bar.innerHTML = `<div class="ab-info"><b>Guerra encerrada</b><small>${esc(v.players[v.winner].name)} cumpriu o objetivo.</small></div><button class="btn primary small" id="ab-res">Ver resultado</button>`; $("ab-res").onclick = showWin; return; }
    if (!v.players[v.me].alive) { bar.innerHTML = `<div class="waiting"><i style="background:#ff4b5c"></i>Você foi eliminado · assistindo a partida</div>`; return; }
    if (!myTurn()) { const c = v.players[v.cur]; bar.innerHTML = `<div class="waiting"><i style="background:${col(c.color)}"></i>Vez de <b>${esc(c.name)}</b>${c.human ? "" : " (CPU)"}</div>`; return; }
    if (v.pending) { bar.innerHTML = `<div class="ab-info"><b>Conquista!</b><small>Escolha quantas tropas avançam.</small></div>`; openPending(); return; }
    let h = "";
    if (v.phase === "deploy" || v.phase === "reinforce") {
      const left = totalRes(), conts = Object.keys(v.reserve.cont).filter(c => v.reserve.cont[c] > 0);
      const must = v.phase === "reinforce" && v.cards.length >= 5;
      h += `<div class="ab-big">${left}</div><div class="ab-info"><b>${v.phase === "deploy" ? "Tropas iniciais" : "Reforços"}</b><small>${must ? "Você tem 5 cartas: troque antes." : left ? "Clique nos seus territórios" + (conts.length ? ` · bônus só em ${conts.map(c => G.map.continents[c].name + " (" + v.reserve.cont[c] + ")").join(", ")}` : "") : "Tudo posicionado."}</small></div>`;
      h += `<div class="chips">${[1, 5, "all"].map(a => `<button data-a="${a}" class="${String(U.amount) === String(a) ? "on" : ""}">${a === "all" ? "Tudo" : "×" + a}</button>`).join("")}</div>`;
      h += `<button class="btn small ghost" id="ab-undo" ${v.canUndo ? "" : "disabled"} title="Desfazer (Z)">↶</button>`;
      h += `<button class="btn ${left ? "" : "primary"}" id="ab-next" ${left || must ? "disabled" : ""}>${v.phase === "deploy" ? "Concluir ▶" : "Atacar ▶"}</button>`;
    } else if (v.phase === "attack") {
      h += `<div class="ab-info"><b>Ataque</b><small>${U.sel == null ? "Escolha um território seu com 2+ tropas" : "Escolha o alvo (vermelho)"}</small></div>`;
      h += `<button class="btn" id="ab-next">Remanejar ▶</button><button class="btn ghost small" id="ab-end">Encerrar turno</button>`;
    } else if (v.phase === "fortify") {
      h += `<div class="ab-info"><b>Remanejamento</b><small>${U.sel == null ? "Escolha a origem (cada tropa move 1 vez)" : "Escolha o destino (azul)"}</small></div>`;
      h += `<button class="btn primary" id="ab-end">Encerrar turno ▶</button>`;
    }
    bar.innerHTML = h;
    bar.querySelectorAll(".chips button").forEach(b => b.onclick = () => { U.amount = b.dataset.a === "all" ? "all" : Number(b.dataset.a); SND.click(); renderAction(); });
    const u = $("ab-undo"); if (u) u.onclick = () => act({ k: "undo" });
    const n = $("ab-next"); if (n) n.onclick = advance;
    const e = $("ab-end"); if (e) e.onclick = () => { closeCombat(); act({ k: "end" }); };
  }
  function advance() {
    const v = G.view; if (!myTurn()) return;
    closeCombat(); U.sel = null;
    if (v.phase === "deploy" || v.phase === "reinforce") act({ k: "toAttack" });
    else if (v.phase === "attack") act({ k: "toFortify" });
    else if (v.phase === "fortify") act({ k: "end" });
  }

  /* ---------------- cliques no mapa ---------------- */
  function onTerrClick(t, e, alt) {
    const v = G.view; if (!v) return;
    if (t < 0) { if (U.sel != null || U.combat) { U.sel = null; closeCombat(); drawHl(); renderAction(); } return; }
    if (!myTurn()) return;
    const mine = v.own[t] === v.me, T = G.map.territories;
    if (v.pending) return;
    if (v.phase === "deploy" || v.phase === "reinforce") {
      if (!mine) { toast("Posicione tropas só nos seus territórios."); return; }
      let n = amountFor(t); if (alt || (e && e.shiftKey)) n = Math.min(n * 5 || 5, v.reserve.free + (v.reserve.cont[T[t].cont] || 0));
      if (n <= 0) { toast(totalRes() ? "Esse continente não pode receber o bônus restante." : "Todas as tropas já foram posicionadas."); return; }
      act({ k: "place", t, n }); return;
    }
    if (v.phase === "attack") {
      if (mine) {
        if (v.troops[t] < 2) { toast("Esse território precisa de pelo menos 2 tropas para atacar."); return; }
        if (!attackTargets(t).length) { toast("Nenhum inimigo vizinho para atacar daqui."); return; }
        U.sel = t; U.target = null; closeCombat(); SND.click(); drawHl(); renderAction(); return;
      }
      if (U.sel == null) { toast("Escolha primeiro um território seu para atacar."); return; }
      if (T[U.sel].adj.indexOf(t) < 0) { toast("Esse alvo não faz fronteira com a origem."); return; }
      if (v.own[t] === v.ally) { toast("Esse jogador é seu aliado."); return; }
      U.target = t; openCombat(U.sel, t); drawHl(); return;
    }
    if (v.phase === "fortify") {
      if (!mine) { toast("Remaneje só entre territórios seus."); return; }
      if (U.sel != null && U.sel !== t && WL.reachable(fakeS(), U.sel).has(t)) { openFortify(U.sel, t); return; }
      const movable = v.troops[t] - 1 - (v.arrived ? v.arrived[t] : 0);
      if (movable < 1) { toast(v.troops[t] < 2 ? "Só tem 1 tropa aqui." : "Essas tropas acabaram de chegar e não podem se mover de novo."); return; }
      if (!WL.reachable(fakeS(), t).size) { toast("Nenhum território seu ligado a este."); return; }
      U.sel = t; closeCombat(); SND.click(); drawHl(); renderAction();
    }
  }

  /* ---------------- painel de combate / movimento ---------------- */
  function openCombat(a, d) { U.combat = { type: "attack", from: a, to: d, dice: 3, res: null }; renderCombat(false); }
  function openFortify(a, b) { const v = G.view, max = v.troops[a] - 1 - (v.arrived ? v.arrived[a] : 0); U.combat = { type: "fortify", from: a, to: b, n: max, max }; renderCombat(false); }
  function openPending() {
    const v = G.view, p = v.pending;
    if (U.combat && U.combat.type === "pending" && U.combat.from === p.from && U.combat.to === p.to) return renderCombat(false);
    U.combat = { type: "pending", from: p.from, to: p.to, n: p.max, min: p.min, max: p.max, res: U.combat && U.combat.res };
    renderCombat(false);
  }
  function closeCombat() { U.combat = null; $("combat").hidden = true; $("actionbar").style.visibility = ""; }
  WL.closeCombat = closeCombat;
  function side(t, cls, label) {
    const v = G.view, o = v.players[v.own[t]];
    return `<div class="cb-side ${cls}" style="--c:${col(o.color)}"><small>${label || (cls === "def" ? "Defesa" : "Origem")} · ${esc(o.name)}</small><b>${esc(G.map.territories[t].name)}</b><span>${v.troops[t]}</span></div>`;
  }
  function renderCombat(animate) {
    const c = U.combat, box = $("combat"), v = G.view; if (!c || !v) { box.hidden = true; $("actionbar").style.visibility = ""; return; }
    box.hidden = false; $("actionbar").style.visibility = "hidden";
    const T = G.map.territories;
    if (c.type === "attack") {
      const canAtt = v.own[c.from] === v.me && v.troops[c.from] >= 2 && v.own[c.to] !== v.me;
      const maxD = Math.max(1, Math.min(3, v.troops[c.from] - 1)); c.dice = Math.min(c.dice, maxD);
      const p = canAtt ? WL.winProb(v.troops[c.from] - 1, v.troops[c.to]) : 0;
      let dice = "", res = "";
      if (c.res) {
        const r = c.res.rounds[c.res.rounds.length - 1];
        const dd = (arr, cls, other) => arr.map((x, i) => `<span class="die ${cls} ${animate ? "roll" : ""} ${i < other.length && ((cls === "a" && x <= other[i]) || (cls === "d" && x < other[i])) ? "lost" : ""}" style="animation-delay:${i * .07}s">${x}</span>`).join("");
        dice = `<div class="dice-row"><div class="dice">${dd(r.ad, "a", r.dd)}</div><div class="dice">${dd(r.dd, "d", r.ad)}</div></div>`;
        res = c.res.conquered ? `<b style="color:var(--good)">Território conquistado!</b>` : `Você perdeu <b>${c.res.la}</b> · inimigo perdeu <b>${c.res.ld}</b>${c.res.rounds.length > 1 ? ` <small>(${c.res.rounds.length} rodadas)</small>` : ""}`;
      }
      box.innerHTML = `<div class="cb-vs">${side(c.from, "att")}<div class="cb-mid">⚔</div>${side(c.to, "def")}</div>${dice}<div class="cb-res">${res}</div>
        ${canAtt ? `<div class="cb-prob"><i style="width:${Math.round(p * 100)}%"></i></div><div class="cb-probtxt"><span>Chance de conquistar indo até o fim</span><b>${Math.round(p * 100)}%</b></div>
        <div class="cb-ctl"><div class="chips">${[1, 2, 3].filter(n => n <= maxD).map(n => `<button data-d="${n}" class="${c.dice === n ? "on" : ""}">${n} ${n > 1 ? "dados" : "dado"}</button>`).join("")}</div>
          <button class="btn warn" id="cb-roll">🎲 Rolar</button><button class="btn" id="cb-blitz" title="Ataca até conquistar ou ficar com 1 tropa">⚡ Até vencer</button><button class="btn ghost small" id="cb-close">Cancelar</button></div>`
        : `<div class="cb-ctl"><span class="hint">${v.own[c.to] === v.me ? "" : "Sem tropas suficientes para continuar daqui."}</span><button class="btn ghost small" id="cb-close">Fechar</button></div>`}`;
      box.querySelectorAll(".chips button").forEach(b => b.onclick = () => { c.dice = Number(b.dataset.d); SND.click(); renderCombat(false); });
      const r = $("cb-roll"); if (r) r.onclick = () => act({ k: "attack", from: c.from, to: c.to, dice: c.dice });
      const bz = $("cb-blitz"); if (bz) bz.onclick = () => act({ k: "blitz", from: c.from, to: c.to });
      $("cb-close").onclick = () => { closeCombat(); U.target = null; drawHl(); };
      return;
    }
    // movimento (pós-conquista ou remanejamento)
    const title = c.type === "pending" ? "Avançar tropas" : "Remanejar tropas", min = c.type === "pending" ? c.min : 1;
    if (c.type === "fortify") { c.max = v.troops[c.from] - 1 - (v.arrived ? v.arrived[c.from] : 0); if (c.max < 1) { closeCombat(); return; } }
    c.n = Math.max(min, Math.min(c.max, c.n));
    box.innerHTML = `<div class="cb-vs">${side(c.from, "att")}<div class="cb-mid">➜</div>${side(c.to, "def", "Destino")}</div>
      <div class="cb-res" style="margin-top:12px"><b>${title}</b> de ${esc(T[c.from].name)} para ${esc(T[c.to].name)}</div>
      <div class="slider"><button class="btn small ghost" id="mv-min">${min}</button><input type="range" id="mv-r" min="${min}" max="${c.max}" value="${c.n}"><button class="btn small ghost" id="mv-max">${c.max}</button><b id="mv-n">${c.n}</b></div>
      <div class="cb-ctl"><button class="btn primary" id="mv-ok">Mover ${c.n}</button>${c.type === "fortify" ? `<button class="btn ghost small" id="cb-close">Cancelar</button>` : ""}</div>`;
    const rng = $("mv-r"), setN = n => { c.n = n; $("mv-n").textContent = n; $("mv-ok").textContent = "Mover " + n; rng.value = n; };
    rng.oninput = () => setN(Number(rng.value));
    $("mv-min").onclick = () => setN(min); $("mv-max").onclick = () => setN(c.max);
    $("mv-ok").onclick = () => {
      if (c.type === "pending") { act({ k: "move", n: c.n }); const from = c.from; closeCombat(); if (G.view && G.view.troops[from] >= 2) U.sel = from; }
      else { act({ k: "fortify", from: c.from, to: c.to, n: c.n }); U.sel = null; closeCombat(); }
    };
    const cl = $("cb-close"); if (cl) cl.onclick = () => { closeCombat(); };
  }

  /* ---------------- painel lateral ---------------- */
  function renderSide() {
    const v = G.view, P = v.players, map = G.map, T = map.territories.length;
    $("mission").textContent = WL.missionText({ map, missionFallback: v.missionFallback }, v.players[v.me].mission);
    $("mission").classList.toggle("hidden-text", !U.showMis);
    $("mis-toggle").textContent = U.showMis ? "ocultar" : "mostrar";
    // cartas
    $("trade-val").textContent = "próxima troca: " + WL.tradeValue(v.trades) + " tropas";
    $("hand").innerHTML = v.cards.map((c, i) => `<button class="cardx ${c.s === 3 ? "jk" : ""} ${c.t >= 0 && v.own[c.t] === v.me ? "mine" : ""} ${U.cards.indexOf(i) >= 0 ? "on" : ""}" data-i="${i}"><b>${c.s === 3 ? "★" : WL.SYMBOLS[c.s]}</b><span>${c.s === 3 ? "Coringa" : esc(map.territories[c.t].name)}</span></button>`).join("");
    $("hand").querySelectorAll(".cardx").forEach(b => b.onclick = () => {
      const i = Number(b.dataset.i), k = U.cards.indexOf(i);
      if (k >= 0) U.cards.splice(k, 1); else { if (U.cards.length >= 3) U.cards.shift(); U.cards.push(i); }
      SND.click(); renderSide();
    });
    let set = U.cards.length === 3 ? U.cards.map(i => v.cards[i]) : null;
    const canTrade = myTurn() && v.phase === "reinforce";
    const auto = WL.findSet(v.cards);
    const tb = $("trade-btn");
    if (set && WL.validSet(set)) { tb.disabled = !canTrade; tb.textContent = "Trocar as 3 selecionadas"; }
    else if (auto && !U.cards.length) { tb.disabled = !canTrade; tb.textContent = `Trocar por ${WL.tradeValue(v.trades)} tropas`; }
    else { tb.disabled = true; tb.textContent = U.cards.length === 3 ? "Combinação inválida" : "Trocar 3 cartas"; }
    tb.onclick = () => { const idx = set && WL.validSet(set) ? U.cards.slice() : auto; if (!idx) return; U.cards = []; act({ k: "trade", cards: idx }); };
    // jogadores
    const terr = P.map(p => v.own.filter(o => o === p.id).length), troops = P.map(p => v.own.reduce((s, o, i) => s + (o === p.id ? v.troops[i] : 0), 0));
    $("players").innerHTML = P.map(p => `<div class="pl ${p.id === v.cur && v.winner == null ? "cur" : ""} ${p.alive ? "" : "dead"}" style="--c:${col(p.color)}">
      <div class="pl-name">${esc(p.name)}${p.id === v.me ? " <small>(você)</small>" : p.human ? "" : ` <small>CPU ${{ easy: "fácil", normal: "normal", hard: "difícil" }[p.diff] || ""}</small>`}${v.ally === p.id ? " 🤝" : ""}</div>
      <div class="pl-stats"><span title="Territórios">🏴 <b>${terr[p.id]}</b></span><span title="Tropas">⚔ <b>${troops[p.id]}</b></span><span title="Cartas">🃏 <b>${p.nCards}</b></span></div>
      <div class="pl-bar"><i style="width:${terr[p.id] / T * 100}%"></i></div></div>`).join("");
    // continentes
    $("conts").innerHTML = map.continents.map(c => {
      const owners = new Set(c.terr.map(t => v.own[t])), mineN = c.terr.filter(t => v.own[t] === v.me).length;
      const own = owners.size === 1 ? P[[...owners][0]] : null;
      return `<div class="ct" data-c="${c.id}"><b>${esc(c.name)}</b><span class="ow">${own ? `<i style="background:${col(own.color)}"></i>${esc(own.name)}` : `${mineN}/${c.terr.length}`}</span><span class="bn">+${c.bonus}</span></div>`;
    }).join("");
    $("conts").querySelectorAll(".ct").forEach(d => {
      d.onmouseenter = () => { U.contHl = Number(d.dataset.c); drawHl(); };
      d.onmouseleave = () => { U.contHl = null; drawHl(); };
    });
    // registro
    const log = $("log"), last = log.dataset.seq ? Number(log.dataset.seq) : 0;
    const fresh = v.log.filter(l => l.seq > last);
    if (fresh.length) {
      fresh.forEach(l => { const d = document.createElement("div"); d.textContent = l.text; if (l.to >= 0) d.className = "priv"; log.appendChild(d); });
      while (log.children.length > 200) log.firstChild.remove();
      log.dataset.seq = fresh[fresh.length - 1].seq; const pane = $("pane-log"); pane.scrollTop = pane.scrollHeight;
    }
    WL.renderSocial && WL.renderSocial();
  }
  $("mis-toggle").onclick = () => { U.showMis = !U.showMis; renderSide(); };
  $("mission").onclick = () => { U.showMis = !U.showMis; renderSide(); };

  /* ---------------- abas / painel ---------------- */
  function setTab(t) {
    document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === t));
    ["cmd", "social", "log"].forEach(k => $("pane-" + k).hidden = k !== t);
    if (t === "social") $("badge").hidden = true;
    if (t === "log") { const p = $("pane-log"); p.scrollTop = p.scrollHeight; }
    WL.tab = t;
  }
  WL.setTab = setTab;
  function badge() { if (WL.tab !== "social") $("badge").hidden = false; }
  WL.badge = badge;
  document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => setTab(b.dataset.tab));
  $("g-side").onclick = () => $("side").classList.toggle("open");
  $("g-menu").onclick = () => { $("seed-info").textContent = G.map ? `Mundo: semente ${G.map.seed} · ${WL.MAP_SIZES[G.map.size].label}.` : ""; openModal("m-menu"); };
  $("mm-copy").onclick = () => { if (G.map) copy(String(G.map.seed), "Semente copiada."); };
  $("mm-quit").onclick = () => { $("m-menu").hidden = true; quitToMenu(); };
  $("room-tag").onclick = () => WL.NET && WL.NET.copyLink();
  function copy(text, ok) { (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast(ok, true), () => toast(text, true)); }
  WL.copy = copy;
  function quitToMenu() {
    stopGame(); WL.NET && WL.NET.leave && WL.NET.leave();
    $("game").hidden = true; $("menu").hidden = false; $("lobby").hidden = true; $("m-win").hidden = true;
    renderPreview();
  }
  WL.quitToMenu = quitToMenu;

  /* ---------------- efeitos ---------------- */
  function floatText(t, text, color) {
    const T = G.map.territories[t]; if (!T || !G.gFx) return;
    const e = el("text", { x: T.x, y: T.y - 22, class: "float", "text-anchor": "middle", fill: color }, G.gFx); e.textContent = text;
    const t0 = performance.now();
    (function a(now) { const k = (now - t0) / 1100; if (k >= 1) { e.remove(); return; } e.setAttribute("y", T.y - 22 - k * 36); e.setAttribute("opacity", 1 - k * k); requestAnimationFrame(a); })(t0);
  }
  function arrow(a, b, color) {
    const A = G.map.territories[a], B = G.map.territories[b]; if (!A || !B || !G.gFx) return;
    const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1, mx = (A.x + B.x) / 2 - dy / L * L * .15, my = (A.y + B.y) / 2 + dx / L * L * .15;
    const p = el("path", { d: `M${A.x} ${A.y}Q${mx} ${my} ${B.x} ${B.y}`, class: "arrow", stroke: color, "stroke-dasharray": L * 1.2, "stroke-dashoffset": L * 1.2, filter: "url(#glow)" }, G.gFx);
    const t0 = performance.now();
    (function an(now) { const k = (now - t0) / 900; if (k >= 1) { p.remove(); return; } p.setAttribute("stroke-dashoffset", L * 1.2 * (1 - Math.min(1, k * 2.2))); p.setAttribute("opacity", k < .6 ? 1 : 1 - (k - .6) / .4); requestAnimationFrame(an); })(t0);
  }
  function ring(t, color) {
    const T = G.map.territories[t]; if (!T || !G.gFx) return;
    const c = el("circle", { cx: T.x, cy: T.y, r: 16, fill: "none", stroke: color, "stroke-width": 4 }, G.gFx), t0 = performance.now();
    (function an(now) { const k = (now - t0) / 800; if (k >= 1) { c.remove(); return; } c.setAttribute("r", 16 + k * 60); c.setAttribute("opacity", 1 - k); requestAnimationFrame(an); })(t0);
  }
  function pulse(t) { const m = mkEls[t]; if (!m) return; m.g.animate([{ transform: `translate(${G.map.territories[t].x}px, ${G.map.territories[t].y}px) scale(1.35)` }, { transform: `translate(${G.map.territories[t].x}px, ${G.map.territories[t].y}px) scale(1)` }], { duration: 300 }); }

  /* ---------------- fim de jogo ---------------- */
  function showWin() {
    const v = G.view; if (!v || v.winner == null) return;
    const w = v.players[v.winner], meWon = v.winner === v.me;
    $("win-tag").textContent = meWon ? "VITÓRIA" : "FIM DA GUERRA";
    $("win-title").innerHTML = meWon ? "Você venceu a guerra!" : `<span style="color:${col(w.color)}">${esc(w.name)}</span> venceu a guerra`;
    $("win-sub").textContent = `${WL.missionText({ map: G.map, missionFallback: v.missionFallback }, w.mission)} · rodada ${v.round}`;
    $("win-list").innerHTML = v.players.map(p => `<div class="${p.id === v.winner ? "w" : ""}" style="--c:${col(p.color)}"><i></i><b>${esc(p.name)}${p.id === v.winner ? " 🏆" : ""}${p.alive ? "" : ` <small>· eliminado por ${esc(v.players[p.elimBy] ? v.players[p.elimBy].name : "?")}</small>`}</b>
      <small>${esc(WL.missionText({ map: G.map, missionFallback: v.missionFallback }, p.mission))}</small></div>`).join("");
    $("win-again").textContent = G.mode === "client" ? "Aguardar o anfitrião" : G.mode === "host" ? "Voltar à sala" : "Nova partida";
    $("win-again").disabled = G.mode === "client";
    $("m-win").hidden = false;
    if (meWon) SND.win(); else SND.lose();
  }
  $("win-map").onclick = () => { $("m-win").hidden = true; };
  $("win-menu").onclick = () => { $("m-win").hidden = true; quitToMenu(); };
  $("win-again").onclick = () => {
    $("m-win").hidden = true;
    if (G.mode === "host") { WL.NET.backToLobby(); return; }
    $("cfg-seed").value = randSeed(); readMenu(); store.set("cfg", menuCfg); renderPreview();
    $("btn-solo").click();
  };

  /* ---------------- atalhos ---------------- */
  document.addEventListener("keydown", e => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || $("game").hidden) { if (e.key === "Escape") document.querySelectorAll(".modal").forEach(m => m.hidden = true); return; }
    const c = U.combat;
    if (e.key === "Escape") { document.querySelectorAll(".modal").forEach(m => m.hidden = true); if (c && c.type !== "pending") { closeCombat(); U.sel = null; drawHl(); renderAction(); } }
    else if (e.key === "Enter" && c) { e.preventDefault(); if (c.type === "attack") { const b = $("cb-roll"); if (b) b.click(); } else { const b = $("mv-ok"); if (b) b.click(); } }
    else if ((e.key === "b" || e.key === "B") && c && c.type === "attack") { const b = $("cb-blitz"); if (b) b.click(); }
    else if (e.key === " " && myTurn() && !G.view.pending) { e.preventDefault(); const b = $("ab-next") || $("ab-end"); if (b && !b.disabled) b.click(); }
    else if ((e.key === "z" || e.key === "Z") && myTurn()) act({ k: "undo" });
  });

  initMenu();
  WL.renderPreview = renderPreview;
  WL.terrScreen = t => { const T = G.map.territories[t], m = svg.getScreenCTM(), p = svg.createSVGPoint(); p.x = T.x; p.y = T.y; const q = p.matrixTransform(m); return [Math.round(q.x), Math.round(q.y)]; };
  WL.render = render;
})();
