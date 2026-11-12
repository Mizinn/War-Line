/* =====================================================================
   WAR-LINE · REDE, SALAS, CHAT, ALIANÇAS E VOZ
   - O código da sala é o ID do anfitrião no PeerJS (prefixo "warline6-").
   - Os amigos conectam direto no navegador do anfitrião (WebRTC); o
     anfitrião roda o motor e valida todas as jogadas.
   - Só a semente do mapa é enviada: cada navegador gera o mesmo mundo.
   - Voz: chamadas WebRTC diretas entre quem entrou na voz.
   Parâmetros opcionais de URL: ?peerhost=&peerport=&peerpath=&peersecure=
   para outro servidor de sinalização; ?turn=&turnuser=&turnpass= para um
   TURN próprio; ?forceTurn=1 para forçar retransmissão.
   ===================================================================== */
(function () {
  "use strict";
  const WL = window.WL;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const PREFIX = "warline6-";
  const LIBS = ["https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js", "https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js"];
  const col = c => (WL.COLORS[c] ? WL.COLORS[c].hex : "#888");

  const NET = (WL.NET = { mode: "solo", peer: null, code: null, members: [], hostConn: null, started: false, seatPeers: {}, myName: "" });
  const VOICE = (WL.VOICE = { stream: null, muted: false, deaf: false, calls: {}, audios: {}, roster: [], talk: {}, ctx: null, timer: 0 });

  function loadPeer() {
    return new Promise((res, rej) => {
      if (typeof Peer !== "undefined") return res();
      let i = 0;
      const next = () => {
        if (i >= LIBS.length) return rej(new Error("peerjs"));
        const s = document.createElement("script"); s.src = LIBS[i++];
        s.onload = () => (typeof Peer !== "undefined" ? res() : next()); s.onerror = next; document.head.appendChild(s);
      };
      next();
    });
  }
  function peerOptions() {
    const q = new URLSearchParams(location.search);
    const ice = [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:global.stun.twilio.com:3478" },
      { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
      { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
      { urls: "turns:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" }
    ];
    if (q.get("turn")) ice.push({ urls: q.get("turn"), username: q.get("turnuser") || "", credential: q.get("turnpass") || "" });
    const o = { debug: 0, config: { iceServers: ice, iceTransportPolicy: q.get("forceTurn") === "1" ? "relay" : "all" } };
    if (q.get("peerhost")) { o.host = q.get("peerhost"); o.port = Number(q.get("peerport") || 443); o.path = q.get("peerpath") || "/"; o.secure = q.get("peersecure") !== "0"; }
    if (window.WAR_PEER_OPTIONS) Object.assign(o, window.WAR_PEER_OPTIONS);
    return o;
  }
  const msg = t => { $("menu-msg").textContent = t || ""; };
  function roomCode() { const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s = ""; for (let i = 0; i < 6; i++) s += A[Math.floor(Math.random() * A.length)]; return s; }

  NET.reset = function () { NET.leave(); NET.mode = "solo"; };
  NET.leave = function () {
    voiceLeave();
    try { if (NET.hostConn) NET.hostConn.close(); } catch (e) { }
    NET.members.forEach(m => { try { m.conn && m.conn.close(); } catch (e) { } });
    try { if (NET.peer) NET.peer.destroy(); } catch (e) { }
    NET.peer = null; NET.hostConn = null; NET.members = []; NET.code = null; NET.started = false; NET.mode = "solo"; NET.seatPeers = {};
    $("lobby").hidden = true; setMenuBusy(false);
  };
  function setMenuBusy(b) { ["btn-solo", "btn-host", "btn-join"].forEach(id => $(id).disabled = b); }
  NET.copyLink = function () { if (!NET.code) return; WL.copy(location.origin + location.pathname + "?sala=" + NET.code, "Link da sala copiado! Mande para os amigos."); };
  $("lobby-copy").onclick = NET.copyLink;
  $("lobby-leave").onclick = () => { NET.leave(); msg("Você saiu da sala."); };

  /* =====================================================================
     ANFITRIÃO
     ===================================================================== */
  $("btn-host").onclick = async () => {
    const cfg = WL.readMenu(); WL.SND.click();
    msg("Conectando ao servidor de salas…"); setMenuBusy(true);
    try { await loadPeer(); } catch (e) { msg("Não consegui carregar a biblioteca de rede (PeerJS). Verifique a internet ou jogue solo."); setMenuBusy(false); return; }
    NET.myName = cfg.name || "Anfitrião";
    openRoom(0);
  };
  function openRoom(attempt) {
    const code = roomCode(), peer = new Peer(PREFIX + code, peerOptions());
    let opened = false;
    peer.on("open", id => {
      opened = true; NET.peer = peer; NET.code = code; NET.mode = "host"; NET.started = false;
      NET.members = [{ name: NET.myName, color: WL.menuCfg.color, peerId: id, conn: null, host: true }];
      msg(""); renderLobby();
    });
    peer.on("connection", conn => {
      conn.on("data", m => onHostData(conn, m));
      conn.on("close", () => onHostClose(conn));
      conn.on("error", () => onHostClose(conn));
    });
    peer.on("call", onCall);
    peer.on("disconnected", () => { try { peer.reconnect(); } catch (e) { } });
    peer.on("error", e => {
      if (e.type === "unavailable-id" && attempt < 5 && !opened) { try { peer.destroy(); } catch (_) { } return openRoom(attempt + 1); }
      if (!opened) { msg("Erro ao criar a sala (" + e.type + "). Tente de novo ou jogue solo."); setMenuBusy(false); }
    });
  }
  function lobbyList() { return NET.members.map(m => ({ name: m.name, color: m.color, host: !!m.host })); }
  function renderLobby(list) {
    const members = list || lobbyList();
    $("lobby").hidden = false;
    $("lobby-code").textContent = NET.code || "------";
    $("lobby-list").innerHTML = members.map(m => `<li><i style="background:${col(m.color)}"></i>${esc(m.name)}${m.host ? "<small>anfitrião</small>" : ""}</li>`).join("");
    if (NET.mode === "host") {
      const n = Math.max(WL.readMenu().players, members.length), cpu = n - members.length;
      $("lobby-info").textContent = `Passe o código ${NET.code} (ou o link ⧉) para os amigos. ${members.length} humano(s)${cpu ? " + " + cpu + " CPU" : ""}. As configurações ao lado valem para a partida.`;
      $("lobby-start").hidden = false;
      NET.members.forEach(m => m.conn && m.conn.open && m.conn.send({ k: "lobby", code: NET.code, members }));
    } else { $("lobby-info").textContent = "Você está na sala! Aguardando o anfitrião começar a partida…"; $("lobby-start").hidden = true; }
  }
  // atualiza o lobby quando o anfitrião muda as configurações
  ["cfg-players", "cfg-size", "cfg-seed"].forEach(id => $(id).addEventListener("change", () => { if (NET.mode === "host" && !NET.started) renderLobby(); }));

  function freeColor(want) {
    const used = new Set(NET.members.map(m => m.color));
    if (!used.has(want)) return want;
    for (let c = 0; c < 6; c++) if (!used.has(c)) return c;
    return want;
  }
  function onHostData(conn, m) {
    if (!m || typeof m !== "object") return;
    const mem = NET.members.find(x => x.conn === conn);
    if (m.k === "hello") {
      if (NET.started) { conn.send({ k: "reject", text: "A partida já começou nessa sala." }); setTimeout(() => conn.close(), 500); return; }
      if (NET.members.length >= 6) { conn.send({ k: "reject", text: "Sala cheia (6 jogadores)." }); setTimeout(() => conn.close(), 500); return; }
      if (mem) return;
      NET.members.push({ name: String(m.name || "Jogador").slice(0, 16), color: freeColor(Number(m.color) || 0), peerId: conn.peer, conn });
      renderLobby(); WL.SND.chat();
      return;
    }
    if (!mem) return;
    if (m.k === "cmd" && NET.started && mem.seat != null) WL.hostExec(mem.seat, m.c || {});
    else if (m.k === "chat" && NET.started && mem.seat != null) routeChat(mem.seat, Number(m.to), String(m.text || "").slice(0, 240));
    else if (m.k === "voice" && NET.started && mem.seat != null) setVoice(mem.seat, !!m.on);
  }
  function onHostClose(conn) {
    const i = NET.members.findIndex(x => x.conn === conn); if (i < 0) return;
    const mem = NET.members[i]; NET.members.splice(i, 1);
    if (!NET.started) { renderLobby(); return; }
    const S = WL.G.S;
    if (S && mem.seat != null && S.players[mem.seat]) {
      const p = S.players[mem.seat]; p.human = false; p.diff = "normal"; p.name += " (CPU)";
      S.log.push({ text: `⚠ ${mem.name} saiu. Uma CPU assumiu o exército.`, to: -1, seq: ++S.seq });
      setVoice(mem.seat, false);
      WL.afterChange();
    }
  }
  $("lobby-start").onclick = () => {
    if (NET.mode !== "host" || NET.started) return;
    const cfg = WL.readMenu();
    const n = Math.max(cfg.players, NET.members.length);
    const used = new Set(NET.members.map(m => m.color)), free = [0, 1, 2, 3, 4, 5].filter(c => !used.has(c));
    const names = WL.CPU_NAMES.slice().sort(() => Math.random() - .5);
    const seats = NET.members.map((m, i) => { m.seat = i; return { name: m.name, color: m.color, human: true }; });
    for (let i = seats.length; i < n; i++) seats.push({ name: names[i], color: free.shift(), human: false, diff: cfg.diff === "mix" ? ["easy", "normal", "hard"][i % 3] : cfg.diff });
    const conf = { seed: cfg.seed, size: cfg.size, seats, cfg: WL.cfgFromMenu() };
    NET.started = true;
    NET.seatPeers = {}; NET.members.forEach(m => NET.seatPeers[m.seat] = m.peerId);
    NET.members.forEach(m => { if (m.conn && m.conn.open) m.conn.send({ k: "start", seat: m.seat, seed: conf.seed, size: conf.size, code: NET.code, seatPeers: NET.seatPeers }); });
    VOICE.roster = [];
    WL.startHosted(conf, 0, "host");
    sysChat("Partida iniciada. Boa sorte, comandantes!");
  };
  NET.sendTo = function (seat, m) {
    const mem = NET.members.find(x => x.seat === seat);
    if (mem && mem.conn && mem.conn.open) { try { mem.conn.send(m); } catch (e) { } }
  };
  NET.backToLobby = function () {
    WL.stopGame(); NET.started = false;
    $("game").hidden = true; $("menu").hidden = false; voiceLeave();
    NET.members.forEach(m => { delete m.seat; if (m.conn && m.conn.open) m.conn.send({ k: "toLobby" }); });
    renderLobby(); WL.renderPreview();
  };

  /* =====================================================================
     CLIENTE
     ===================================================================== */
  $("btn-join").onclick = async () => {
    const code = $("join-code").value.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) { msg("Digite o código de 6 letras/números da sala."); return; }
    const cfg = WL.readMenu(); WL.SND.click();
    msg("Conectando à sala " + code + "…"); setMenuBusy(true);
    try { await loadPeer(); } catch (e) { msg("Não consegui carregar a biblioteca de rede (PeerJS)."); setMenuBusy(false); return; }
    const peer = new Peer(peerOptions());
    NET.peer = peer; NET.myName = cfg.name || "Jogador";
    let ok = false;
    const fail = setTimeout(() => { if (!ok) { msg("Não encontrei a sala " + code + ". Confira o código e se o anfitrião está com a página aberta."); NET.leave(); } }, 15000);
    peer.on("open", () => {
      const conn = peer.connect(PREFIX + code, { reliable: true });
      NET.hostConn = conn;
      conn.on("open", () => { ok = true; clearTimeout(fail); NET.mode = "client"; NET.code = code; conn.send({ k: "hello", name: NET.myName, color: WL.menuCfg.color }); msg(""); });
      conn.on("data", onClientData);
      conn.on("close", () => {
        if (NET.mode !== "client") return;
        const inGame = !$("game").hidden;
        NET.leave(); WL.stopGame();
        if (inGame) { WL.quitToMenu(); }
        msg("A conexão com o anfitrião caiu (a sala fecha se o anfitrião sair).");
      });
    });
    peer.on("call", onCall);
    peer.on("error", e => { if (!ok) { clearTimeout(fail); msg(e.type === "peer-unavailable" ? "Sala " + code + " não encontrada." : "Erro de conexão (" + e.type + ")."); NET.leave(); } });
  };
  function onClientData(m) {
    if (!m || typeof m !== "object") return;
    switch (m.k) {
      case "lobby": NET.code = m.code; renderLobby(m.members); break;
      case "reject": msg(m.text); NET.leave(); break;
      case "start": {
        NET.seatPeers = m.seatPeers || {}; NET.started = true;
        const G = WL.G; WL.stopGame(); G.mode = "client"; G.me = m.seat;
        WL.chatLog = [];
        WL.enterGame(WL.genMap(m.seed, m.size));
        break;
      }
      case "state": WL.onState(m.v, m.ev); break;
      case "err": WL.toast(m.text); break;
      case "chat": addChat(m); break;
      case "voiceRoster": VOICE.roster = m.list || []; voiceSync(); WL.renderSocial(); break;
      case "toLobby": WL.stopGame(); NET.started = false; voiceLeave(); $("game").hidden = true; $("menu").hidden = false; $("m-win").hidden = true; renderLobby(); break;
    }
  }
  NET.sendCmd = function (c) { if (NET.hostConn && NET.hostConn.open) NET.hostConn.send({ k: "cmd", c }); else WL.toast("Sem conexão com o anfitrião."); };

  /* =====================================================================
     CHAT (público e privado) — o anfitrião roteia
     ===================================================================== */
  WL.chatLog = [];
  function sysChat(text) { routeChat(-1, -1, text, true); }
  function routeChat(from, to, text, sys) {
    if (!text) return;
    const S = WL.G.S; if (!S) return;
    const m = { k: "chat", from, to, text, sys: !!sys, name: from >= 0 ? S.players[from].name : "", color: from >= 0 ? S.players[from].color : -1 };
    S.players.forEach((p, i) => {
      if (!p.human && i !== WL.G.me) return;
      if (to >= 0 && i !== to && i !== from) return;
      if (i === WL.G.me) addChat(m); else NET.sendTo(i, m);
    });
    // CPUs respondem de vez em quando
    if (!sys && from >= 0 && S.players[from].human) {
      const cpus = S.players.filter(p => !p.human && p.alive);
      const target = to >= 0 ? S.players[to] : null;
      const responder = target && !target.human ? target : (to < 0 && cpus.length && Math.random() < .3 ? cpus[Math.floor(Math.random() * cpus.length)] : null);
      if (responder) setTimeout(() => { if (WL.G.S === S) routeChat(responder.id, to >= 0 ? from : -1, WL.CPU_LINES[Math.floor(Math.random() * WL.CPU_LINES.length)]); }, 900 + Math.random() * 1800);
    }
  }
  function addChat(m) {
    WL.chatLog.push(m); if (WL.chatLog.length > 150) WL.chatLog.shift();
    const box = $("chat"), d = document.createElement("div");
    const v = WL.G.view, priv = m.to >= 0;
    d.className = "msg" + (priv ? " priv" : "") + (m.sys ? " sys" : "");
    if (m.sys) d.textContent = m.text;
    else {
      const toName = priv && v ? (m.from === WL.G.me ? " → " + (v.players[m.to] ? v.players[m.to].name : "?") : " (privado)") : "";
      d.innerHTML = `<b style="--c:${col(m.color)};color:${col(m.color)}">${esc(m.name)}${esc(toName)}:</b> ${esc(m.text)}`;
    }
    box.appendChild(d); while (box.children.length > 150) box.firstChild.remove();
    box.scrollTop = box.scrollHeight;
    if (m.from !== WL.G.me) { WL.badge(); if (!m.sys) WL.SND.chat(); }
  }
  $("chat-form").addEventListener("submit", e => {
    e.preventDefault();
    const text = $("chat-in").value.trim(); if (!text) return;
    const to = Number($("chat-to").value);
    $("chat-in").value = "";
    if (WL.G.mode === "client") NET.hostConn && NET.hostConn.open && NET.hostConn.send({ k: "chat", to, text });
    else routeChat(WL.G.me, to, text);
  });

  /* =====================================================================
     PAINEL SOCIAL (alianças, destinatários, voz)
     ===================================================================== */
  let socialKey = "";
  WL.renderSocial = function () {
    const v = WL.G.view; if (!v) return;
    const others = v.players.filter(p => p.id !== v.me);
    // destinatários do chat
    const key = others.map(p => p.id + p.name + p.alive).join("|");
    if (key !== socialKey) {
      socialKey = key; const sel = $("chat-to"), cur = sel.value;
      sel.innerHTML = `<option value="-1">Todos</option>` + others.filter(p => p.alive).map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("");
      if ([...sel.options].some(o => o.value === cur)) sel.value = cur;
    }
    // alianças
    const box = $("ally-list");
    if (!v.cfg.alliances) { box.innerHTML = `<p class="hint">Alianças desligadas nesta partida.</p>`; }
    else {
      box.innerHTML = others.filter(p => p.alive).map(p => {
        let right;
        const inc = v.allyReq.find(r => r.from === p.id && r.to === v.me), out = v.allyReq.find(r => r.from === v.me && r.to === p.id);
        if (v.ally === p.id) right = `<span class="hint" style="margin:0;color:var(--good)">Aliado</span><button class="btn small ghost danger" data-a="break">Romper</button>`;
        else if (inc) right = `<button class="btn small primary" data-a="yes" data-p="${p.id}">Aceitar</button><button class="btn small ghost" data-a="no" data-p="${p.id}">Recusar</button>`;
        else if (out) right = `<span class="hint" style="margin:0">Proposta enviada…</span>`;
        else right = `<button class="btn small" data-a="ask" data-p="${p.id}" ${v.ally != null || v.winner != null ? "disabled" : ""}>Propor</button>`;
        return `<div class="ally-row"><span class="nm"><i style="background:${col(p.color)}"></i>${esc(p.name)}</span>${right}</div>`;
      }).join("") || `<p class="hint">Ninguém disponível.</p>`;
      box.querySelectorAll("button[data-a]").forEach(b => b.onclick = () => {
        const a = b.dataset.a, p = Number(b.dataset.p);
        if (a === "ask") WL.act({ k: "ally", to: p });
        else if (a === "yes" || a === "no") WL.act({ k: "allyAnswer", to: p, yes: a === "yes" });
        else if (a === "break") WL.act({ k: "allyBreak" });
      });
    }
    // voz
    const online = WL.G.mode !== "solo";
    $("v-join").disabled = !online; $("v-deaf").disabled = !online;
    $("voice-hint").textContent = online ? (location.protocol === "https:" || location.hostname === "localhost" ? "A voz conecta direto com quem também entrou." : "O microfone só funciona em endereço https (como o do GitHub Pages).") : "A voz funciona nas partidas online.";
    $("v-join").textContent = VOICE.stream ? "Sair da voz" : "🎙 Entrar na voz";
    $("v-mute").disabled = !VOICE.stream; $("v-mute").textContent = VOICE.muted ? "Desmutar" : "Mutar";
    $("v-deaf").textContent = VOICE.deaf ? "🔔 Ouvir todos" : "🔕 Silenciar todos";
    $("voice-list").innerHTML = VOICE.roster.map(r => { const p = v.players[r.seat]; return p ? `<div class="${VOICE.talk[r.seat] ? "talk" : ""}"><i></i>${esc(p.name)}${r.seat === v.me ? " (você)" + (VOICE.muted ? " · mudo" : "") : ""}</div>` : ""; }).join("");
  };

  /* =====================================================================
     VOZ (WebRTC via PeerJS)
     ===================================================================== */
  function setVoice(seat, on) { // anfitrião mantém a lista de quem está na voz
    VOICE.roster = VOICE.roster.filter(r => r.seat !== seat);
    if (on) VOICE.roster.push({ seat, peerId: seat === WL.G.me ? NET.peer.id : NET.seatPeers[seat] });
    const m = { k: "voiceRoster", list: VOICE.roster };
    NET.members.forEach(x => x.conn && x.conn.open && x.conn.send(m));
    voiceSync(); WL.renderSocial();
  }
  $("v-join").onclick = async () => {
    if (VOICE.stream) { voiceLeave(); announceVoice(false); WL.renderSocial(); return; }
    try { VOICE.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch (e) { WL.toast("Não consegui acessar o microfone (permita no navegador; precisa de https)."); return; }
    VOICE.muted = false; meter("me", VOICE.stream);
    announceVoice(true); WL.renderSocial();
  };
  $("v-mute").onclick = () => { if (!VOICE.stream) return; VOICE.muted = !VOICE.muted; VOICE.stream.getAudioTracks().forEach(t => t.enabled = !VOICE.muted); WL.renderSocial(); };
  $("v-deaf").onclick = () => { VOICE.deaf = !VOICE.deaf; Object.values(VOICE.audios).forEach(a => a.muted = VOICE.deaf); WL.renderSocial(); };
  function announceVoice(on) { if (NET.mode === "host") setVoice(WL.G.me, on); else if (NET.hostConn && NET.hostConn.open) NET.hostConn.send({ k: "voice", on }); }
  function voiceSync() { // liga para quem está na voz e ainda não tem chamada
    if (!VOICE.stream || !NET.peer) return;
    const myId = NET.peer.id;
    VOICE.roster.forEach(r => {
      if (!r.peerId || r.peerId === myId || VOICE.calls[r.peerId]) return;
      if (myId < r.peerId) { const call = NET.peer.call(r.peerId, VOICE.stream, { metadata: { seat: WL.G.me } }); wireCall(call, r.seat); }
    });
    Object.keys(VOICE.calls).forEach(pid => { if (!VOICE.roster.some(r => r.peerId === pid)) { try { VOICE.calls[pid].close(); } catch (e) { } dropCall(pid); } });
  }
  function onCall(call) {
    if (!VOICE.stream) { try { call.close(); } catch (e) { } return; }
    call.answer(VOICE.stream); wireCall(call, call.metadata && call.metadata.seat);
  }
  function wireCall(call, seat) {
    VOICE.calls[call.peer] = call;
    call.on("stream", s => {
      let a = VOICE.audios[call.peer]; if (!a) { a = new Audio(); a.autoplay = true; VOICE.audios[call.peer] = a; }
      a.srcObject = s; a.muted = VOICE.deaf; a.play().catch(() => { });
      const r = VOICE.roster.find(x => x.peerId === call.peer); meter(r ? r.seat : seat, s);
    });
    call.on("close", () => dropCall(call.peer));
    call.on("error", () => dropCall(call.peer));
  }
  function dropCall(pid) { const a = VOICE.audios[pid]; if (a) { a.srcObject = null; delete VOICE.audios[pid]; } delete VOICE.calls[pid]; }
  function meter(seat, stream) {
    try {
      const A = window.AudioContext || window.webkitAudioContext; if (!A) return;
      VOICE.ctx = VOICE.ctx || new A();
      const src = VOICE.ctx.createMediaStreamSource(stream), an = VOICE.ctx.createAnalyser(); an.fftSize = 512; src.connect(an);
      const buf = new Uint8Array(an.frequencyBinCount), key = seat === "me" ? WL.G.me : seat;
      (VOICE.meters = VOICE.meters || {})[key] = { an, buf };
      if (!VOICE.timer) VOICE.timer = setInterval(() => {
        let changed = false;
        for (const k in VOICE.meters) { const m = VOICE.meters[k]; m.an.getByteFrequencyData(m.buf); let s = 0; for (const x of m.buf) s += x; const talk = s / m.buf.length > 18 && !(Number(k) === WL.G.me && VOICE.muted); if (!!VOICE.talk[k] !== talk) { VOICE.talk[k] = talk; changed = true; } }
        if (changed && WL.tab === "social") WL.renderSocial();
      }, 200);
    } catch (e) { }
  }
  function voiceLeave() {
    Object.values(VOICE.calls).forEach(c => { try { c.close(); } catch (e) { } });
    VOICE.calls = {}; Object.keys(VOICE.audios).forEach(dropCall);
    if (VOICE.stream) VOICE.stream.getTracks().forEach(t => t.stop());
    VOICE.stream = null; VOICE.meters = {}; VOICE.talk = {}; clearInterval(VOICE.timer); VOICE.timer = 0;
  }
})();
