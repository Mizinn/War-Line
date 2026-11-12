/* =====================================================================
   WAR-LINE · MOTOR DA PARTIDA
   Regras, validação de jogadas, cartas, missões e inteligência das CPUs.
   Quem roda o motor é o "anfitrião" (no solo, o próprio navegador).
   Cada jogador recebe só a sua visão (cartas e missão alheias ocultas).
   ===================================================================== */
(function () {
  "use strict";
  const WL = (window.WL = window.WL || {});

  WL.COLORS = [
    { name: "Verde", hex: "#2fe07f" },
    { name: "Vermelho", hex: "#ff4b5c" },
    { name: "Amarelo", hex: "#ffd23f" },
    { name: "Azul", hex: "#3fa9ff" },
    { name: "Roxo", hex: "#b071ff" },
    { name: "Laranja", hex: "#ff8c2b" }
  ];
  const SYMBOLS = ["■", "●", "▲"];
  WL.SYMBOLS = SYMBOLS;
  WL.tradeValue = n => (n < 5 ? [4, 6, 8, 10, 12][n] : 15 + 5 * (n - 5)); // n = trocas já feitas

  const shuffle = (a, R) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  /* ---------- probabilidades de combate (para a IA e para a interface) ---------- */
  const ROUND = {}; // ROUND[a+","+d] = lista de {p, la, ld}
  (function () {
    for (let a = 1; a <= 3; a++) for (let d = 1; d <= 3; d++) {
      const res = {}, total = Math.pow(6, a + d), dice = new Array(a + d).fill(1);
      for (let n = 0; n < total; n++) {
        let x = n; for (let k = 0; k < a + d; k++) { dice[k] = (x % 6) + 1; x = Math.floor(x / 6); }
        const A = dice.slice(0, a).sort((p, q) => q - p), D = dice.slice(a).sort((p, q) => q - p);
        let la = 0, ld = 0; for (let k = 0; k < Math.min(a, d); k++) { if (A[k] > D[k]) ld++; else la++; }
        res[la + "," + ld] = (res[la + "," + ld] || 0) + 1;
      }
      ROUND[a + "," + d] = Object.keys(res).map(k => { const [la, ld] = k.split(",").map(Number); return { p: res[k] / total, la, ld }; });
    }
  })();
  const WINP = new Map();
  // chance de conquistar: a = tropas que podem atacar (sem contar a que fica), d = defensores
  WL.winProb = function winProb(a, d) {
    if (d <= 0) return 1; if (a <= 0) return 0;
    if (a > 80 || d > 80) { const k = 80 / Math.max(a, d); a = Math.max(1, Math.round(a * k)); d = Math.max(1, Math.round(d * k)); }
    const key = a * 100 + d; if (WINP.has(key)) return WINP.get(key);
    let p = 0; for (const o of ROUND[Math.min(3, a) + "," + Math.min(3, d)]) p += o.p * winProb(a - o.la, d - o.ld);
    WINP.set(key, p); return p;
  };

  /* ---------- criação da partida ---------- */
  // c = { seed, size, seats:[{name, color, human, diff}], cfg:{missions, alliances, timer, speed} }
  WL.createGame = function (c) {
    const map = WL.genMap(c.seed, c.size);
    const R = WL.rng((c.seed * 31 + 7) >>> 0 ^ (Date.now() & 0xffff));
    const T = map.territories.length, n = c.seats.length;
    const S = {
      v: 1, seed: c.seed, size: c.size, cfg: c.cfg, map,
      players: c.seats.map((s, i) => ({ id: i, name: s.name, color: s.color, human: !!s.human, diff: s.diff || "normal", alive: true, cards: [], mission: null, conq: false, elimBy: null })),
      own: new Array(T).fill(-1), troops: new Array(T).fill(1), arrived: new Array(T).fill(0),
      cur: 0, round: 0, phase: "deploy", reserve: { free: 0, cont: {} }, placed: [], trades: 0,
      deck: [], pending: null, allies: [], winner: null, turnStart: 0, deadline: 0, log: [], seq: 0, R
    };
    // distribui territórios
    const ids = shuffle(map.territories.map(t => t.id), R);
    const first = Math.floor(R() * n);
    ids.forEach((id, k) => { S.own[id] = (first + k) % n; });
    S.cur = first; S.firstOfRound = first;
    // baralho: um card por território + 2 coringas
    S.deck = shuffle(map.territories.map(t => ({ t: t.id, s: t.id % 3 })).concat([{ t: -1, s: 3 }, { t: -1, s: 3 }]), R);
    // missões
    if (c.cfg.missions) assignMissions(S);
    S.startPool = Math.max(6, Math.round(T * 1.05 / n));
    beginTurn(S, true);
    return S;
  };

  function assignMissions(S) {
    const m = S.map, T = m.territories.length, R = S.R, list = [];
    const nT = Math.round(T * 0.57), n2 = Math.round(T * 0.43);
    const conts = m.continents;
    const pairs = [];
    for (let a = 0; a < conts.length; a++) for (let b = a + 1; b < conts.length; b++) {
      const tot = conts[a].terr.length + conts[b].terr.length;
      if (tot >= T * 0.3 && tot <= T * 0.48) pairs.push([a, b]);
    }
    shuffle(pairs, R).slice(0, 5).forEach(([a, b]) => list.push({ k: "conts", c: [a, b], plus: false }));
    // dois menores + um à escolha
    const small = conts.slice().sort((x, y) => x.terr.length - y.terr.length);
    if (small.length >= 3) list.push({ k: "conts", c: [small[0].id, small[1].id], plus: true });
    list.push({ k: "count", n: nT, min: 1 });
    list.push({ k: "count", n: n2, min: 2 });
    S.players.forEach(p => list.push({ k: "kill", color: p.color }));
    shuffle(list, R);
    S.players.forEach(p => {
      let idx = list.findIndex(x => !(x.k === "kill" && x.color === p.color));
      p.mission = list.splice(idx, 1)[0];
    });
    S.missionFallback = { k: "count", n: nT, min: 1 };
  }

  WL.missionText = function (S, mis) {
    if (!mis) return "Dominação total: conquiste todos os territórios do mapa.";
    const m = S.map;
    switch (mis.k) {
      case "conts": return `Conquistar ${m.continents[mis.c[0]].name} e ${m.continents[mis.c[1]].name}` + (mis.plus ? " e mais um continente à sua escolha." : " por completo.");
      case "count": return mis.min > 1 ? `Conquistar ${mis.n} territórios e manter pelo menos ${mis.min} tropas em cada um.` : `Conquistar ${mis.n} territórios à sua escolha.`;
      case "kill": return `Destruir totalmente os exércitos ${WL.COLORS[mis.color].name.toLowerCase()}s. Se isso não for possível, conquistar ${S.missionFallback.n} territórios.`;
    }
    return "";
  };

  /* ---------- utilidades de estado ---------- */
  const owned = (S, p) => { const r = []; for (let i = 0; i < S.own.length; i++) if (S.own[i] === p) r.push(i); return r; };
  WL.owned = owned;
  const contOwned = (S, p, c) => S.map.continents[c].terr.every(id => S.own[id] === p);
  WL.contOwned = contOwned;
  function reinforcements(S, p) {
    const n = owned(S, p).length, free = Math.max(3, Math.floor(n / 2)), cont = {};
    S.map.continents.forEach(c => { if (contOwned(S, p, c.id)) cont[c.id] = c.bonus; });
    return { free, cont };
  }
  WL.reinforcements = reinforcements;
  const totalRes = r => r.free + Object.values(r.cont).reduce((a, b) => a + b, 0);
  WL.totalRes = totalRes;
  const ally = (S, p) => { const a = S.allies.find(x => x[0] === p || x[1] === p); return a ? (a[0] === p ? a[1] : a[0]) : null; };
  WL.allyOf = ally;
  WL.reachable = function (S, from) { // territórios próprios conectados (para remanejar)
    const p = S.own[from], seen = new Set([from]), q = [from];
    while (q.length) { const a = q.pop(); for (const b of S.map.territories[a].adj) if (!seen.has(b) && S.own[b] === p) { seen.add(b); q.push(b); } }
    seen.delete(from); return seen;
  };
  WL.validSet = function (cards) {
    if (cards.length !== 3) return false;
    const s = cards.map(c => c.s), jok = s.filter(x => x === 3).length;
    if (jok >= 1) return true;
    return (s[0] === s[1] && s[1] === s[2]) || (s[0] !== s[1] && s[1] !== s[2] && s[0] !== s[2]);
  };
  function findSet(hand) {
    for (let a = 0; a < hand.length; a++) for (let b = a + 1; b < hand.length; b++) for (let c = b + 1; c < hand.length; c++)
      if (WL.validSet([hand[a], hand[b], hand[c]])) return [a, b, c];
    return null;
  }
  WL.findSet = findSet;

  function log(S, text, to) { S.log.push({ text, to: to == null ? -1 : to, seq: ++S.seq }); if (S.log.length > 300) S.log.splice(0, S.log.length - 300); }
  function ev(S, e) { (S.events = S.events || []).push(e); }
  const pn = (S, p) => S.players[p].name;

  /* ---------- turnos ---------- */
  function beginTurn(S, initial) {
    const p = S.players[S.cur];
    S.placed = []; S.pending = null; S.arrived.fill(0); p.conq = false;
    if (S.phase === "deploy") {
      S.reserve = { free: S.startPool, cont: {} };
      log(S, `${p.name} posiciona as tropas iniciais.`);
    } else {
      S.phase = "reinforce";
      S.reserve = reinforcements(S, S.cur);
      const bonusTxt = Object.keys(S.reserve.cont).map(c => `${S.map.continents[c].name} +${S.reserve.cont[c]}`).join(", ");
      log(S, `Rodada ${S.round} · vez de ${p.name}: ${S.reserve.free} tropas${bonusTxt ? " + bônus " + bonusTxt : ""}.`);
    }
    S.turnStart = Date.now();
    S.deadline = S.cfg.timer ? Date.now() + S.cfg.timer * 1000 : 0;
    ev(S, { k: "turn", p: S.cur, phase: S.phase });
    if (!initial) checkWin(S, S.cur);
  }

  function nextPlayer(S) {
    if (S.winner != null) return;
    const n = S.players.length;
    let q = S.cur;
    for (let k = 0; k < n; k++) {
      q = (q + 1) % n;
      if (q === S.firstOfRound) {
        if (S.phase === "deploy") { S.phase = "reinforce"; S.round = 1; }
        else S.round++;
      }
      if (S.players[q].alive) break;
    }
    S.cur = q;
    beginTurn(S);
  }

  /* ---------- comandos (validados) ---------- */
  // Retorna string de erro ou null.
  WL.exec = function (S, p, c) {
    if (S.winner != null) return "A partida acabou.";
    if (S.firstOfRound == null) S.firstOfRound = S.cur;
    const me = S.players[p];
    if (!me || !me.alive) return "Você não está mais no jogo.";
    if (c.k === "ally" || c.k === "allyAnswer" || c.k === "allyBreak") return allyCmd(S, p, c);
    if (S.cur !== p) return "Não é a sua vez.";
    const T = S.map.territories;
    switch (c.k) {
      case "place": {
        if (S.phase !== "reinforce" && S.phase !== "deploy") return "Fase errada.";
        if (S.players[p].cards.length >= 5 && S.phase === "reinforce") return "Você tem 5 cartas: troque antes de posicionar.";
        const t = c.t | 0, n = Math.max(1, c.n | 0);
        if (S.own[t] !== p) return "Esse território não é seu.";
        const cid = T[t].cont;
        let fromCont = Math.min(n, S.reserve.cont[cid] || 0), fromFree = n - fromCont;
        if (fromFree > S.reserve.free) return "Tropas insuficientes" + (totalRes(S.reserve) ? " (bônus de continente só vale dentro do continente)." : ".");
        if (fromCont) S.reserve.cont[cid] -= fromCont;
        S.reserve.free -= fromFree; S.troops[t] += n;
        S.placed.push({ t, n, c: fromCont ? cid : -1, cn: fromCont });
        ev(S, { k: "place", t, n, p });
        return null;
      }
      case "undo": {
        if (S.phase !== "reinforce" && S.phase !== "deploy") return "Nada para desfazer.";
        const u = S.placed.pop(); if (!u) return "Nada para desfazer.";
        S.troops[u.t] -= u.n; if (u.cn) S.reserve.cont[u.c] += u.cn; S.reserve.free += u.n - u.cn;
        ev(S, { k: "place", t: u.t, n: -u.n, p });
        return null;
      }
      case "trade": {
        if (S.phase !== "reinforce") return "Só dá para trocar cartas na fase de reforço.";
        const idx = (c.cards || []).map(Number);
        if (idx.length !== 3 || new Set(idx).size !== 3 || idx.some(i => !me.cards[i])) return "Escolha 3 cartas.";
        const set = idx.map(i => me.cards[i]);
        if (!WL.validSet(set)) return "Combinação inválida: 3 iguais, 3 diferentes ou com coringa.";
        const val = WL.tradeValue(S.trades); S.trades++;
        S.reserve.free += val;
        const bonus = [];
        set.forEach(card => { if (card.t >= 0 && S.own[card.t] === p) { S.troops[card.t] += 2; bonus.push(card.t); } });
        me.cards = me.cards.filter((_, i) => idx.indexOf(i) < 0);
        S.deck.push(...set); // volta para o fim do baralho
        log(S, `${me.name} trocou cartas por ${val} tropas${bonus.length ? ` (+2 em ${bonus.map(t => T[t].name).join(", ")})` : ""}.`);
        ev(S, { k: "trade", p, val, bonus });
        return null;
      }
      case "toAttack": {
        if (S.phase === "deploy") {
          if (totalRes(S.reserve) > 0) return "Posicione todas as tropas iniciais primeiro.";
          log(S, `${me.name} terminou o posicionamento inicial.`);
          nextPlayer(S); return null;
        }
        if (S.phase !== "reinforce") return "Fase errada.";
        if (totalRes(S.reserve) > 0) return "Posicione todas as tropas antes de atacar.";
        if (me.cards.length >= 5) return "Você tem 5 cartas: troque antes.";
        S.phase = "attack"; S.placed = []; ev(S, { k: "phase", phase: "attack" });
        return null;
      }
      case "attack": case "blitz": {
        if (S.phase !== "attack") return "Fase errada.";
        if (S.pending) return "Mova as tropas para o território conquistado primeiro.";
        const a = c.from | 0, d = c.to | 0;
        if (S.own[a] !== p) return "A origem precisa ser sua.";
        if (S.own[d] === p) return "Não dá para atacar a si mesmo.";
        if (T[a].adj.indexOf(d) < 0) return "Os territórios não fazem fronteira.";
        if (S.troops[a] < 2) return "A origem precisa de pelo menos 2 tropas.";
        if (ally(S, p) === S.own[d]) return "Vocês são aliados. Rompa a aliança para atacar.";
        const rounds = [];
        let dice = Math.max(1, Math.min(3, c.dice | 0 || 3));
        do {
          const na = Math.min(dice, 3, S.troops[a] - 1), nd = Math.min(3, S.troops[d]);
          const ad = roll(S, na), dd = roll(S, nd);
          let la = 0, ld = 0; for (let k = 0; k < Math.min(na, nd); k++) { if (ad[k] > dd[k]) ld++; else la++; }
          S.troops[a] -= la; S.troops[d] -= ld; rounds.push({ ad, dd, la, ld });
          if (S.troops[d] <= 0) break;
          if (c.k === "blitz") dice = 3;
        } while (c.k === "blitz" && S.troops[a] > 1 && (c.stop == null || S.troops[a] > c.stop));
        const def = S.own[d], la = rounds.reduce((s, r) => s + r.la, 0), ld = rounds.reduce((s, r) => s + r.ld, 0);
        const conquered = S.troops[d] <= 0;
        const lastDice = Math.min(3, rounds[rounds.length - 1].ad.length);
        ev(S, { k: "combat", p, def, from: a, to: d, rounds, la, ld, conquered });
        if (conquered) {
          S.own[d] = p; S.troops[d] = 0; me.conq = true;
          const min = Math.min(lastDice, S.troops[a] - 1), max = S.troops[a] - 1;
          S.pending = { from: a, to: d, min: Math.max(1, min), max };
          log(S, `${me.name} conquistou ${T[d].name} de ${pn(S, def)} (perdeu ${la}, destruiu ${ld}).`);
          if (S.pending.min === S.pending.max) finishMove(S, p, S.pending.min);
          if (!owned(S, def).length) eliminate(S, def, p);
          checkWin(S, p);
        } else if (c.k === "blitz") log(S, `${me.name} atacou ${T[d].name} (${pn(S, def)}) em sequência: perdeu ${la}, destruiu ${ld}.`);
        return null;
      }
      case "move": {
        if (!S.pending) return "Nada para mover.";
        const n = c.n | 0; if (n < S.pending.min || n > S.pending.max) return `Mova entre ${S.pending.min} e ${S.pending.max} tropas.`;
        finishMove(S, p, n); checkWin(S, p); return null;
      }
      case "toFortify": {
        if (S.phase !== "attack") return "Fase errada.";
        if (S.pending) return "Mova as tropas para o território conquistado primeiro.";
        S.phase = "fortify"; S.arrived.fill(0); ev(S, { k: "phase", phase: "fortify" }); return null;
      }
      case "fortify": {
        if (S.phase !== "fortify") return "Fase errada.";
        const a = c.from | 0, b = c.to | 0, n = c.n | 0;
        if (S.own[a] !== p || S.own[b] !== p) return "Os dois territórios precisam ser seus.";
        if (!WL.reachable(S, a).has(b)) return "O destino precisa estar ligado à origem por territórios seus.";
        const movable = S.troops[a] - 1 - S.arrived[a];
        if (n < 1 || n > movable) return movable < 1 ? "As tropas desse território já se moveram neste turno (ou só resta 1)." : `Dá para mover até ${movable}.`;
        S.troops[a] -= n; S.troops[b] += n; S.arrived[b] += n;
        ev(S, { k: "move", p, from: a, to: b, n });
        return null;
      }
      case "end": {
        if (S.phase === "deploy") return "Termine o posicionamento inicial.";
        if (S.phase === "reinforce" && totalRes(S.reserve) > 0) return "Posicione todas as tropas primeiro.";
        if (S.pending) return "Mova as tropas para o território conquistado primeiro.";
        if (me.conq && S.deck.length) { const card = S.deck.shift(); me.cards.push(card); ev(S, { k: "card", p }); log(S, `${me.name} recebeu uma carta.`, -1); }
        nextPlayer(S); return null;
      }
    }
    return "Comando desconhecido.";
  };

  function finishMove(S, p, n) {
    const { from, to } = S.pending;
    S.troops[from] -= n; S.troops[to] += n; S.pending = null;
    ev(S, { k: "move", p, from, to, n, conquest: true });
  }
  function roll(S, n) { const r = []; for (let i = 0; i < n; i++) r.push(1 + Math.floor(S.R() * 6)); return r.sort((a, b) => b - a); }

  function eliminate(S, victim, killer) {
    const v = S.players[victim], k = S.players[killer];
    v.alive = false; v.elimBy = killer;
    k.cards.push(...v.cards); v.cards = [];
    S.allies = S.allies.filter(a => a[0] !== victim && a[1] !== victim);
    log(S, `☠ ${v.name} foi eliminado por ${k.name}!`);
    if (S.players.filter(x => x.alive).length <= 2 && S.allies.length) { S.allies = []; log(S, "Restam só dois exércitos: todas as alianças foram desfeitas."); }
    ev(S, { k: "elim", p: victim, by: killer });
    // missões de destruir essa cor feitas por outros viram "conquistar N"
    S.players.forEach(pl => { if (pl.mission && pl.mission.k === "kill" && pl.mission.color === v.color && pl.id !== killer) pl.mission = Object.assign({ was: "kill" }, S.missionFallback); });
  }

  function missionDone(S, p) {
    const pl = S.players[p], m = pl.mission, mine = owned(S, p);
    if (S.players.filter(x => x.alive).length === 1) return true;
    if (!m) return mine.length === S.own.length;
    switch (m.k) {
      case "conts": {
        if (!m.c.every(c => contOwned(S, p, c))) return false;
        if (!m.plus) return true;
        return S.map.continents.some(c => m.c.indexOf(c.id) < 0 && contOwned(S, p, c.id));
      }
      case "count": return mine.filter(t => S.troops[t] >= m.min).length >= m.n;
      case "kill": {
        const target = S.players.find(x => x.color === m.color);
        if (!target) return mine.length >= S.missionFallback.n;
        if (!target.alive) return target.elimBy === p || mine.length >= S.missionFallback.n;
        return false;
      }
    }
    return false;
  }
  function checkWin(S, p) {
    if (S.winner != null) return;
    // verifica o jogador da vez primeiro, depois os outros (quem cumpre por consequência)
    const order = [p].concat(S.players.map(x => x.id).filter(x => x !== p));
    for (const q of order) if (S.players[q].alive && missionDone(S, q)) {
      S.winner = q; S.phase = "over"; S.pending = null;
      log(S, `🏆 ${pn(S, q)} cumpriu o objetivo e venceu a guerra!`);
      ev(S, { k: "win", p: q });
      return;
    }
  }
  WL.missionDone = missionDone;
  WL.checkWin = checkWin;

  /* ---------- alianças secretas ---------- */
  function allyCmd(S, p, c) {
    if (!S.cfg.alliances) return "Alianças desligadas nesta partida.";
    const q = c.to | 0, P = S.players;
    if (c.k === "ally") {
      if (q === p || !P[q] || !P[q].alive) return "Jogador inválido.";
      if (ally(S, p) != null || ally(S, q) != null) return "Cada jogador só pode ter uma aliança.";
      S.allyReq = (S.allyReq || []).filter(r => !(r.from === p && r.to === q));
      S.allyReq.push({ from: p, to: q, at: Date.now() });
      log(S, `Você propôs aliança a ${P[q].name}.`, p);
      log(S, `🤝 ${P[p].name} propôs uma aliança secreta a você.`, q);
      ev(S, { k: "allyReq", from: p, to: q });
      return null;
    }
    if (c.k === "allyAnswer") {
      const req = (S.allyReq || []).find(r => r.from === q && r.to === p);
      if (!req) return "Proposta não encontrada.";
      S.allyReq = S.allyReq.filter(r => r !== req);
      if (c.yes && ally(S, p) == null && ally(S, q) == null) {
        S.allies.push([q, p]);
        log(S, `🤝 Aliança secreta com ${P[q].name} firmada.`, p); log(S, `🤝 ${P[p].name} aceitou a aliança.`, q);
      } else { log(S, `${P[p].name} recusou a aliança.`, q); log(S, `Você recusou a aliança de ${P[q].name}.`, p); }
      ev(S, { k: "ally" });
      return null;
    }
    if (c.k === "allyBreak") {
      const a = ally(S, p); if (a == null) return "Você não tem aliança.";
      S.allies = S.allies.filter(x => !(x.indexOf(p) >= 0));
      log(S, `Você rompeu a aliança com ${P[a].name}.`, p); log(S, `💔 ${P[p].name} rompeu a aliança com você!`, a);
      ev(S, { k: "ally" });
      return null;
    }
  }

  /* ---------- visão de cada jogador ---------- */
  WL.viewFor = function (S, p) {
    const over = S.winner != null;
    return {
      seed: S.seed, size: S.size, cfg: S.cfg, me: p,
      players: S.players.map(x => ({ id: x.id, name: x.name, color: x.color, human: x.human, diff: x.diff, alive: x.alive, nCards: x.cards.length,
        mission: over || x.id === p ? x.mission : null, elimBy: x.elimBy })),
      own: S.own.slice(), troops: S.troops.slice(), arrived: S.cur === p ? S.arrived.slice() : null,
      cur: S.cur, round: S.round, phase: S.phase, reserve: JSON.parse(JSON.stringify(S.reserve)), canUndo: S.cur === p && S.placed.length > 0,
      trades: S.trades, cards: S.players[p] ? S.players[p].cards.slice() : [], pending: S.pending, deck: S.deck.length,
      ally: ally(S, p), allyReq: (S.allyReq || []).filter(r => r.to === p || r.from === p), winner: S.winner,
      deadline: S.deadline, startPool: S.startPool, missionFallback: S.missionFallback,
      log: S.log.filter(l => l.to === -1 || l.to === p).slice(-80)
    };
  };

  /* =====================================================================
     INTELIGÊNCIA DAS CPUs
     Retorna o próximo comando da CPU (um por vez, para a interface animar).
     ===================================================================== */
  const AIP = {
    easy: { attackP: 0.72, greed: 0.35, maxAtt: 4, rand: 0.35 },
    normal: { attackP: 0.64, greed: 0.6, maxAtt: 10, rand: 0.15 },
    hard: { attackP: 0.55, greed: 1.0, maxAtt: 30, rand: 0.02 }
  };
  function threat(S, p, t) {
    let th = 0; for (const b of S.map.territories[t].adj) if (S.own[b] !== p && WL.allyOf(S, p) !== S.own[b]) th += S.troops[b];
    return th;
  }
  function missionConts(S, p) { const m = S.players[p].mission; return m && m.k === "conts" ? m.c : []; }
  function contValue(S, p, cid) {
    const c = S.map.continents[cid], mine = c.terr.filter(t => S.own[t] === p).length;
    let v = (mine / c.terr.length) * c.bonus / Math.max(2, c.terr.length) * 6 + c.bonus * 0.3;
    if (missionConts(S, p).indexOf(cid) >= 0) v += 4;
    return v;
  }
  // melhor ataque possível (minP < 0 aceita alvos ainda fora de alcance: usado para planejar reforços)
  function bestAttack(S, p, P, extra) {
    const me = S.players[p], T = S.map.territories, R = S.R, mine = owned(S, p);
    const en = b => S.own[b] !== p && WL.allyOf(S, p) !== S.own[b];
    const thr = Math.max(.35, P.attackP - Math.min(.22, Math.max(0, S.round - 6) * .02));
    let best = null, bv = 0;
    for (const a of mine) {
      if (S.troops[a] < 2 && extra >= 0) continue;
      for (const d of T[a].adj) {
        if (!en(d)) continue;
        const pw = WL.winProb(Math.max(0, S.troops[a] - 1 + Math.max(0, -extra) * (extra < 0 ? 1 : 0) + (extra < 0 ? S.reserve.free : 0)), S.troops[d]);
        if (pw < thr) continue;
        let v = pw * 3 + contValue(S, p, T[d].cont) * P.greed;
        const dc = S.map.continents[T[d].cont];
        if (dc.terr.every(t => S.own[t] === S.own[d])) v += 2.5; // quebra bônus inimigo
        if (dc.terr.filter(t => S.own[t] !== p).length === 1) v += 3; // completa um continente
        if (owned(S, S.own[d]).length <= 2) v += 3; // pode eliminar
        const m = me.mission;
        if (m && m.k === "kill" && S.players[S.own[d]].color === m.color) v += 3;
        if (m && m.k === "count") v += 1;
        if (!me.conq) v += 1.5; // garante a carta
        v += R() * P.rand * 4;
        if (v > bv) { bv = v; best = { a, d }; }
      }
    }
    return best;
  }
  WL.aiStep = function (S) {
    const p = S.cur, me = S.players[p], P = AIP[me.diff] || AIP.normal, T = S.map.territories, R = S.R;
    const mine = owned(S, p), en = b => S.own[b] !== p && WL.allyOf(S, p) !== S.own[b];
    if (S.pending) {
      const { from, to, min, max } = S.pending;
      const thFrom = threat(S, p, from), thTo = threat(S, p, to);
      let n = thTo >= thFrom ? max : Math.max(min, Math.round((max + min) / 2));
      if (!T[from].adj.some(en)) n = max;
      return { k: "move", n: Math.max(min, Math.min(max, n)) };
    }
    if (S.phase === "deploy" || S.phase === "reinforce") {
      if (S.phase === "reinforce") {
        const set = findSet(me.cards);
        if (set) return { k: "trade", cards: set };
      }
      if (totalRes(S.reserve) <= 0) return { k: "toAttack" };
      // bônus de continente primeiro
      const cids = Object.keys(S.reserve.cont).filter(c => S.reserve.cont[c] > 0);
      let cands = mine.filter(t => T[t].adj.some(en));
      if (!cands.length) cands = mine;
      if (cids.length) { const cid = Number(cids[0]); const inC = cands.filter(t => T[t].cont === cid); cands = inC.length ? inC : mine.filter(t => T[t].cont === cid); }
      // normal/difícil: concentra os reforços livres no melhor ponto de ataque
      if (!cids.length && me.diff !== "easy" && S.phase === "reinforce") {
        const plan = bestAttack(S, p, P, -6);
        if (plan) {
          const n = Math.max(1, Math.ceil(S.reserve.free * (me.diff === "hard" ? .8 : .65)));
          // ameaça grave em outro lugar? divide
          if (me.diff === "hard") {
            const entries = mine.filter(t => WL.contOwned(S, p, T[t].cont) && T[t].adj.some(b => en(b) && T[b].cont !== T[t].cont) && threat(S, p, t) > S.troops[t]);
            if (entries.length && S.reserve.free > 1) { const e = entries.sort((a, b) => (threat(S, p, b) - S.troops[b]) - (threat(S, p, a) - S.troops[a]))[0]; return { k: "place", t: e, n: Math.max(1, Math.min(S.reserve.free, threat(S, p, e) - S.troops[e] + 1, Math.ceil(S.reserve.free / 2))) }; }
          }
          const danger = mine.filter(t => threat(S, p, t) > S.troops[t] * 2.5 + 4).sort((a, b) => (threat(S, p, b) - S.troops[b]) - (threat(S, p, a) - S.troops[a]))[0];
          if (danger != null && danger !== plan.a && S.reserve.free > 2 && R() < .5) return { k: "place", t: danger, n: Math.ceil(S.reserve.free / 3) };
          return { k: "place", t: plan.a, n: Math.max(1, Math.min(S.reserve.free, n)) };
        }
      }
      let best = cands[0], bv = -1e9;
      for (const t of cands) {
        const th = threat(S, p, t), weakEnemy = Math.max(0, ...T[t].adj.filter(en).map(b => S.troops[t] - S.troops[b]));
        let v = th - S.troops[t] * 0.7 + contValue(S, p, T[t].cont) * 2 * P.greed + (weakEnemy > 0 ? 2 : 0) + R() * 6 * P.rand * 3;
        if (v > bv) { bv = v; best = t; }
      }
      const amount = cids.length ? Math.min(S.reserve.cont[cids[0]], 3) : Math.min(S.reserve.free, Math.max(1, Math.ceil(S.reserve.free / 2)));
      return { k: "place", t: best, n: Math.max(1, amount) };
    }
    if (S.phase === "attack") {
      S.aiAtt = (S.aiAtt || 0);
      if (S.aiAtt < P.maxAtt) {
        const best = bestAttack(S, p, P, 0);
        if (best) { S.aiAtt++; return { k: "blitz", from: best.a, to: best.d, stop: 1 }; }
      }
      S.aiAtt = 0;
      return { k: "toFortify" };
    }
    if (S.phase === "fortify") {
      S.aiFort = (S.aiFort || 0);
      if (S.aiFort < (me.diff === "hard" ? 6 : me.diff === "normal" ? 3 : 1)) {
        // leva tropas do interior para a fronteira mais ameaçada alcançável
        const interior = mine.filter(t => !T[t].adj.some(en) && S.troops[t] - 1 - S.arrived[t] > 0).sort((x, y) => S.troops[y] - S.troops[x]);
        for (const a of interior) {
          const reach = [...WL.reachable(S, a)].filter(t => T[t].adj.some(en));
          if (!reach.length) continue;
          const b = reach.sort((x, y) => (threat(S, p, y) - S.troops[y]) - (threat(S, p, x) - S.troops[x]))[0];
          S.aiFort++;
          return { k: "fortify", from: a, to: b, n: S.troops[a] - 1 - S.arrived[a] };
        }
      }
      S.aiFort = 0;
      return { k: "end" };
    }
    return { k: "end" };
  };

  // CPU responde a propostas de aliança
  WL.aiAllyAnswer = function (S, cpu, from) {
    const a = owned(S, cpu).length, b = owned(S, from).length, R = S.R;
    const leader = S.players.filter(x => x.alive).map(x => owned(S, x.id).length).sort((x, y) => y - x)[0];
    let yes = R() < 0.35; if (b < leader && a < leader) yes = R() < 0.7; if (b === leader) yes = R() < 0.15;
    return yes;
  };

  // Tempo esgotado: termina o turno da forma mais segura
  WL.autoFinish = function (S) {
    const p = S.cur, guard = 200; let g = 0;
    while (S.cur === p && S.winner == null && g++ < guard) {
      let c;
      if (S.pending) c = { k: "move", n: S.pending.min };
      else if (S.phase === "deploy" || S.phase === "reinforce") {
        if (S.players[p].cards.length >= 5) { const set = findSet(S.players[p].cards); if (set) { WL.exec(S, p, { k: "trade", cards: set }); continue; } }
        if (totalRes(S.reserve) > 0) {
          const cids = Object.keys(S.reserve.cont).filter(c => S.reserve.cont[c] > 0);
          const mine = owned(S, p).filter(t => !cids.length || S.map.territories[t].cont === Number(cids[0]));
          c = { k: "place", t: mine[Math.floor(S.R() * mine.length)], n: 1 };
        } else c = { k: S.phase === "deploy" ? "toAttack" : "end" };
      } else c = { k: "end" };
      const err = WL.exec(S, p, c);
      if (err && c.k === "end" && S.phase === "reinforce") WL.exec(S, p, { k: "toAttack" });
    }
  };
})();
