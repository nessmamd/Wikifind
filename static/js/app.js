/* ============================================================
   CONFIG
   Practice mode pulls challenges and articles straight from the
   Wikipedia API and races against simulated bots. Live mode talks
   to the Flask backend for challenges, leaderboards and rooms:  ?live=1&api=http://localhost:5000&ws=ws://localhost:5000/ws

   REST (live mode)
     GET  /api/challenge?difficulty=easy|medium|hard
          -> {id,start,target,par,optimal:[titles],score,label,drift}
     GET  /api/leaderboard?challenge=<id>   -> [{name,ms,hops}]
     POST /api/runs  {challengeId,name,ms,hops,path}

   WebSocket protocol (JSON, one object per message, `type` field)
     client -> server: create{name,challenge,solo} join{code,name}
                       start ready hop{article,hops}
                       finish{ms,path} forfeit leave
     server -> client: welcome{id} room{code,players:[{id,name,host}],challenge}
                       start{startsAt,challenge} progress{id,article,hops,dist}
                       finished{id,ms,hops} forfeit{id}
   ============================================================ */
const CONFIG = (() => {
  const q = new URLSearchParams(location.search);
  return {
    live: q.get('live') === '1',
    API_BASE: (q.get('api') || 'http://localhost:5000').replace(/\/$/, ''),
    WS_URL: q.get('ws') || 'ws://localhost:5000/ws',
  };
})();

// ==WIKIPEDIA==
// Challenges come straight from the Wikipedia API, like the extension does:
// a random start article (list=random), then a random walk through its links.
// The walk's length sets the difficulty and guarantees the target is reachable.
const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const HOPS = { easy: 2, medium: 3, hard: 5 };
const BORING = /^(List of|Lists of|Index of|Outline of)\b|^\d+( BC| AD)?$|^\d+s( BC)?$|^(January|February|March|April|May|June|July|August|September|October|November|December) \d+$/;
async function randomTitles(n = 10) {
  const r = await fetch(`${WIKI_API}?action=query&list=random&rnnamespace=0&rnlimit=${n}&format=json&formatversion=2&origin=*`);
  if (!r.ok) throw new Error('Wikipedia is not responding right now.');
  const data = await r.json();
  return data.query.random.map(r => r.title);
}
async function walk(start, hops) {
  let a = await Wiki.get(start);
  const route = [a.title];
  while (route.length <= hops) {
    const seen = new Set(route.map(norm));
    const next = a.links.slice(0, 40).filter(t => !seen.has(norm(t)) && !BORING.test(t));
    if (!next.length) return null;
    try { a = await Wiki.get(next[Math.floor(Math.random() * next.length)]); } catch { return null; }
    if (seen.has(norm(a.title))) return null; // a redirect led back onto the route
    route.push(a.title);
  }
  return route;
}
async function makeChallenge(diff) {
  for (let round = 0; round < 3; round++) {
    for (const start of await randomTitles()) {
      if (BORING.test(start)) continue;
      const route = await walk(start, HOPS[diff]).catch(() => null);
      if (!route) continue;
      const s = route[0], t = route[route.length - 1];
      return { id: `${s}--${t}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-'), start: s, target: t, par: route.length - 1, optimal: route, label: diff, drift: null };
    }
  }
  throw new Error('Could not build a challenge from Wikipedia. Try again.');
}
// Clicks left from `title` along the challenge's known route, or null if off it.
function routeDist(ch, title) {
  const i = ch.optimal.map(norm).lastIndexOf(norm(title));
  return i < 0 ? null : ch.optimal.length - 1 - i;
}
// ==END WIKIPEDIA==

/* ---------- utilities ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clicks = n => `${n} click${n === 1 ? '' : 's'}`;
const cap = s => s[0].toUpperCase() + s.slice(1);
const norm = s => String(s).replace(/_/g, ' ').trim().replace(/^./, c => c.toUpperCase());
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
function fmt(ms) { const t = Math.floor(ms / 100), m = Math.floor(t / 600), s = Math.floor(t / 10) % 60; return `${m}:${String(s).padStart(2, '0')}.${t % 10}`; }
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
let toastTimer;
function toast(msg) { const el = $('#toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.hidden = true, 4200); }

/* ---------- API (REST) ---------- */
const Api = {
  async challenge(diff) {
    if (CONFIG.live) {
      try { const r = await fetch(`${CONFIG.API_BASE}/api/challenge?difficulty=${diff}`); if (r.ok) return await r.json(); } catch {}
      toast('Could not reach the game server, so this is a practice challenge.');
    }
    return makeChallenge(diff);
  },
  async leaderboard(ch) {
    if (CONFIG.live) {
      try { const r = await fetch(`${CONFIG.API_BASE}/api/leaderboard?challenge=${encodeURIComponent(ch.id)}`); if (r.ok) return await r.json(); } catch {}
    }
    const rand = rng(hash(ch.id));
    const names = ['citation_needed', 'ada_lovelinks', 'tab_hoarder', 'hyperlinda', 'redlink_rex', 'see_also'];
    const seeded = names.filter(() => rand() < 0.7).slice(0, 5).map(name => ({ name, hops: ch.par + (rand() < 0.5 ? 0 : 1 + Math.floor(rand() * 3)), ms: Math.round(ch.par * 6500 + rand() * 40000) }));
    const mine = store.get('wr-runs', []).filter(r => r.challengeId === ch.id).map(r => ({ ...r, you: true }));
    return [...seeded, ...mine].sort((a, b) => a.ms - b.ms).slice(0, 8);
  },
  async submit(run) {
    if (CONFIG.live) {
      try { await fetch(`${CONFIG.API_BASE}/api/runs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(run) }); return; } catch {}
    }
    const runs = store.get('wr-runs', []); runs.push(run); store.set('wr-runs', runs.slice(-200));
  },
};

/* ---------- article source ---------- */
const _articles = new Map();
const Wiki = {
  async get(title) {
    const k = norm(title);
    if (!_articles.has(k)) _articles.set(k, liveArticle(title).catch(e => { _articles.delete(k); throw e; }));
    return _articles.get(k);
  },
};
async function liveArticle(title) {
  const url = `${WIKI_API}?action=parse&page=${encodeURIComponent(title)}&prop=text&redirects=1&format=json&formatversion=2&origin=*`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Wikipedia is not responding right now.');
  const data = await r.json();
  if (!data.parse) throw new Error(`Wikipedia has no article called “${title}”.`);
  const doc = new DOMParser().parseFromString(data.parse.text, 'text/html');
  const root = doc.querySelector('.mw-parser-output') || doc.body;
  const links = [];
  root.querySelectorAll('sup.reference, .mw-editsection, style, table, .hatnote, .navbox, figure, .thumb').forEach(n => n.remove());
  const inline = node => [...node.childNodes].map(n => {
    if (n.nodeType === 3) return esc(n.textContent);
    if (n.nodeType !== 1) return '';
    if (n.tagName === 'A') {
      const href = n.getAttribute('href') || '';
      const m = href.match(/^\/wiki\/([^#?]+)/);
      if (m && !decodeURIComponent(m[1]).includes(':')) {
        const to = norm(decodeURIComponent(m[1]));
        links.push(to);
        return `<a href="#" class="wl" data-to="${esc(to)}">${inline(n)}</a>`;
      }
      return inline(n);
    }
    if (['B', 'STRONG'].includes(n.tagName)) return `<b>${inline(n)}</b>`;
    if (['I', 'EM'].includes(n.tagName)) return `<i>${inline(n)}</i>`;
    return inline(n);
  }).join('');
  let html = '', count = 0;
  for (const el of root.children) {
    if (count > 40) break;
    if (el.tagName === 'P' && el.textContent.trim()) { html += `<p>${inline(el)}</p>`; count++; }
    else if (/^H[23]$/.test(el.tagName) || el.classList.contains('mw-heading')) { const h = el.querySelector('h2,h3') || el; if (/references|external links|notes|further reading|sources/i.test(h.textContent)) break; html += `<h2>${esc(h.textContent)}</h2>`; }
    else if (el.tagName === 'UL') { html += `<ul>${[...el.children].map(li => `<li>${inline(li)}</li>`).join('')}</ul>`; count++; }
  }
  return { title: data.parse.title, cat: null, html, links: [...new Set(links)] };
}

/* ---------- sockets ---------- */
class Emitter {
  constructor() { this.h = {}; }
  on(t, f) { (this.h[t] = this.h[t] || []).push(f); }
  emit(t, d) { (this.h[t] || []).forEach(f => f(d)); }
}
class LiveSocket extends Emitter {
  constructor(url) {
    super(); this.q = []; this.closed = false;
    this.ws = new WebSocket(url);
    this.ws.onopen = () => { this.q.forEach(m => this.ws.send(m)); this.q = []; };
    this.ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } this.emit(m.type, m); };
    this.ws.onerror = () => this.emit('error', { message: `Could not reach the game server at ${url}.` });
    this.ws.onclose = () => { if (!this.closed) this.emit('disconnect', {}); };
  }
  send(m) { const s = JSON.stringify(m); this.ws.readyState === 1 ? this.ws.send(s) : this.q.push(s); }
  close() { this.closed = true; try { this.ws.close(); } catch {} }
}
const BOTS = [
  { id: 'b1', name: 'citation_needed', pace: 5200, slip: 0.15 },
  { id: 'b2', name: 'ada_lovelinks', pace: 7000, slip: 0.08 },
  { id: 'b3', name: 'tab_hoarder', pace: 4100, slip: 0.32 },
];
// Plays the server's role in demo mode, with the same message protocol.
class MockSocket extends Emitter {
  constructor() { super(); this.timers = []; this.players = []; this.race = 0; this.closed = false; }
  later(ms, fn) { this.timers.push(setTimeout(() => !this.closed && fn(), ms)); }
  close() { this.closed = true; this.timers.forEach(clearTimeout); }
  room() { this.emit('room', { code: this.code, players: this.players.slice(), challenge: this.ch }); }
  send(m) {
    const net = fn => this.later(50 + Math.random() * 90, fn);
    switch (m.type) {
      case 'create': net(() => {
        this.code = Array.from({ length: 4 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)]).join('');
        this.ch = m.challenge; this.players = [{ id: 'me', name: m.name, host: true }];
        this.emit('welcome', { id: 'me' }); this.room();
        if (!m.solo) BOTS.forEach((b, i) => this.later(1200 + i * 1600, () => { this.players.push({ id: b.id, name: b.name }); this.room(); }));
      }); break;
      case 'join': net(() => {
        this.code = m.code; this.ch = m.challenge;
        this.players = [{ id: BOTS[0].id, name: BOTS[0].name, host: true }, { id: BOTS[1].id, name: BOTS[1].name }, { id: 'me', name: m.name }];
        this.emit('welcome', { id: 'me' }); this.room(); this.later(5000, () => this.send({ type: 'start' }));
      }); break;
      case 'ready': if (!this.players.find(p => p.id === 'me')?.host) this.later(4000, () => this.send({ type: 'start' })); break;
      case 'start': net(() => {
        const startsAt = Date.now() + 3000, race = ++this.race;
        this.emit('start', { startsAt, challenge: this.ch });
        this.players.filter(p => p.id !== 'me').forEach(p => this.runBot(p, startsAt, race));
      }); break;
      case 'hop': net(() => this.emit('progress', { id: 'me', article: m.article, hops: m.hops, dist: routeDist(this.ch, m.article) })); break;
      case 'finish': net(() => this.emit('finished', { id: 'me', ms: m.ms, hops: m.path.length - 1 })); break;
      case 'forfeit': net(() => this.emit('forfeit', { id: 'me' })); break;
      case 'leave': this.close(); break;
    }
  }
  // Bots follow the challenge's known route, sometimes slipping back a step.
  runBot(p, startsAt, race) {
    const bot = BOTS.find(b => b.id === p.id), route = this.ch.optimal, last = route.length - 1;
    let i = 0, hops = 0;
    const delay = () => bot.pace * (0.7 + Math.random() * 0.8);
    const step = () => {
      if (race !== this.race) return;
      i = i > 0 && Math.random() < bot.slip ? i - 1 : i + 1; hops++;
      if (i === last) return this.emit('finished', { id: p.id, ms: Date.now() - startsAt, hops });
      this.emit('progress', { id: p.id, article: route[i], hops, dist: last - i });
      if (hops >= 25) return this.emit('forfeit', { id: p.id });
      this.later(delay(), step);
    };
    this.later(Math.max(0, startsAt - Date.now()) + delay(), step);
  }
}

/* ---------- state ---------- */
const S = {
  screen: 'home', name: store.get('wr-name', ''), difficulty: 'medium',
  challenge: null, loading: false, mode: 'solo', me: 'me', room: null, players: [],
  racers: {}, path: [], clicks: 0, startAt: 0, finishedMs: null, gaveUp: false,
};
let sock = null;
function connect() {
  if (sock) sock.close();
  sock = CONFIG.live ? new LiveSocket(CONFIG.WS_URL) : new MockSocket();
  sock.on('welcome', m => S.me = m.id);
  sock.on('room', m => { S.room = m.code; S.players = m.players; if (m.challenge) S.challenge = m.challenge; if (S.screen === 'lobby') render(); });
  sock.on('start', m => beginRace(m.startsAt, m.challenge));
  sock.on('progress', m => { Object.assign(racer(m.id), { article: m.article, hops: m.hops, dist: m.dist }); refreshRacers(); });
  sock.on('finished', m => { Object.assign(racer(m.id), { finishedMs: m.ms, hops: m.hops, dist: 0, article: S.challenge.target }); refreshRacers(); });
  sock.on('forfeit', m => { racer(m.id).gaveUp = true; refreshRacers(); });
  sock.on('error', m => toast(m.message));
  sock.on('disconnect', () => { if (S.screen !== 'home') toast('Lost connection to the game server.'); });
}
function racer(id) {
  if (!S.racers[id]) {
    const p = S.players.find(p => p.id === id);
    S.racers[id] = { id, name: p ? p.name : id, hops: 0, article: S.challenge.start, dist: S.challenge.par, finishedMs: null, gaveUp: false };
  }
  return S.racers[id];
}
function standings() {
  return Object.values(S.racers).sort((a, b) =>
    (a.finishedMs == null) - (b.finishedMs == null) || (a.finishedMs ?? 0) - (b.finishedMs ?? 0) ||
    a.gaveUp - b.gaveUp || (a.dist ?? 99) - (b.dist ?? 99));
}
function myName() {
  if (!S.name.trim()) { S.name = 'guest' + Math.floor(100 + Math.random() * 900); }
  S.name = S.name.trim().slice(0, 20); store.set('wr-name', S.name); return S.name;
}

/* ---------- views ---------- */
function viewHeader() {
  return `<header class="top">
    <button class="brand" data-act="home">Wikirace</button>
    <div class="mode ${CONFIG.live ? 'live' : ''}"><i></i>${CONFIG.live ? `Connected to ${esc(CONFIG.API_BASE)}` : `Practice mode<span class="wide">, live from Wikipedia</span>`}</div>
  </header>`;
}
function viewHome() {
  const c = S.challenge;
  if (!c) return `<section class="hero"><p class="lede">${S.loading ? 'Finding a challenge on Wikipedia…' : 'No challenge loaded.'}</p>
    ${S.loading ? '' : `<div class="pick"><button class="btn" data-act="shuffle">Try again</button></div>`}</section>`;
  return `<section class="hero" aria-labelledby="route">
    <p class="lede">Get from</p>
    <h1 class="route" id="route">
      <span class="from">${esc(c.start)}</span>
      <span class="gap" aria-hidden="true"><span>${S.loading ? 'finding a new one…' : `reachable in ${clicks(c.par)}`}</span></span>
      <span class="sr">to</span>
      <span class="to">${esc(c.target)}</span>
    </h1>
    <p class="how">Start on the first article and reach the second using only links in the text. The clock starts when the race does, and every click counts, including going back.</p>
    <div class="engine">
      <div><span class="k">Difficulty</span><span class="v">${c.score != null ? `${c.score.toFixed(1)}<small> of 10, ${c.label}</small>` : cap(c.label)}</span></div>
      <div><span class="k">Known route</span><span class="v">${clicks(c.par)}</span></div>
      ${c.drift != null ? `<div><span class="k">Topic drift</span><span class="v">${c.drift.toFixed(1)}<small> subject jumps</small></span></div>` : ''}
    </div>
    <div class="pick">
      <div class="seg" role="radiogroup" aria-label="Difficulty">
        ${['easy', 'medium', 'hard'].map(d => `<button role="radio" aria-checked="${S.difficulty === d}" data-act="diff" data-diff="${d}">${cap(d)}</button>`).join('')}
      </div>
      <button class="btn ghost" data-act="shuffle"${S.loading ? ' disabled' : ''}>New challenge</button>
    </div>
  </section>
  <section class="play" aria-label="Start playing">
    <label class="field"><span>Your name</span><input type="text" id="name" maxlength="20" value="${esc(S.name)}" placeholder="linkhopper" autocomplete="nickname"></label>
    <div class="actions">
      <button class="btn primary" data-act="solo">Play solo</button>
      <button class="btn" data-act="host">Create a room</button>
      <div class="join"><input type="text" id="code" maxlength="4" placeholder="Room code" aria-label="Room code" autocomplete="off"><button class="btn" data-act="join">Join</button></div>
    </div>
  </section>
  <section class="board"><h2>Fastest on ${esc(c.start)} to ${esc(c.target)}</h2><div id="lb" class="tbl"><p class="muted">Loading times…</p></div></section>`;
}
function viewBoard(rows) {
  if (!rows.length) return `<p class="muted">No finishes yet. Set the first time.</p>`;
  return `<table class="wikitable"><thead><tr><th scope="col">#</th><th scope="col">Player</th><th scope="col">Time</th><th scope="col">Clicks</th></tr></thead><tbody>
    ${rows.map((r, i) => `<tr class="${r.you ? 'you' : ''}"><td class="n">${i + 1}</td><td>${esc(r.name)}${r.you ? ' (you)' : ''}</td><td class="n">${fmt(r.ms)}</td><td class="n">${r.hops}</td></tr>`).join('')}
  </tbody></table>`;
}
function viewLobby() {
  const c = S.challenge, host = S.players.find(p => p.host), iHost = host && host.id === S.me;
  return `<section class="lobby">
    <p class="lede">Room code</p>
    <h1 class="code">${esc(S.room || '····')}</h1>
    <p class="how">Share the code so others can join. Everyone races from ${esc(c.start)} to ${esc(c.target)}.</p>
    <ul class="players" aria-label="Players in this room">
      ${S.players.map(p => `<li><span>${esc(p.name)}${p.id === S.me ? ' (you)' : ''}</span>${p.host ? '<span class="tag">Host</span>' : ''}</li>`).join('') || '<li class="muted">Connecting…</li>'}
    </ul>
    <div class="actions">
      ${iHost ? `<button class="btn primary" data-act="start">Start race</button>` : `<p class="muted" style="margin:0 12px 0 0">Waiting for ${esc(host ? host.name : 'the host')} to start the race</p>`}
      <button class="btn ghost" data-act="leave">Leave room</button>
    </div>
  </section>`;
}
function viewRace() {
  const c = S.challenge;
  return `<div class="hud" role="region" aria-label="Race status">
    <div><span class="k">Target</span><span class="t">${esc(c.target)}</span></div>
    <div><span class="k">Time</span><span class="v" id="timer">0:00.0</span></div>
    <div><span class="k">Clicks</span><span class="v" id="clicks">0</span></div>
    <div class="hud-acts"><button class="btn ghost sm" data-act="back" id="backbtn" disabled>Back</button><button class="btn ghost sm danger" data-act="giveup">Give up</button></div>
  </div>
  <div class="race">
    <article class="article" id="article" aria-live="polite"></article>
    <aside class="side">
      <section><h2>Your route</h2><ol class="trail" id="trail"></ol></section>
      <section><h2>${S.mode === 'solo' ? 'Progress' : 'Racers'}</h2><ul class="racers" id="racers"></ul></section>
    </aside>
  </div>
  <div class="countdown" id="countdown" hidden><div><b aria-live="assertive"></b><p>Start on <em>${esc(c.start)}</em>, find <em>${esc(c.target)}</em></p></div></div>`;
}
function viewResults() {
  const c = S.challenge, here = S.path[S.path.length - 1];
  const head = S.gaveUp ? `You stopped on ${esc(here)} after ${clicks(S.clicks)}` : `You reached ${esc(c.target)} in ${fmt(S.finishedMs)}`;
  const diff = S.clicks - c.par;
  const left = routeDist(c, here);
  const sub = S.gaveUp ? (left != null ? `${esc(c.target)} was ${clicks(left)} away from there along the known route.` : `You were off the known route to ${esc(c.target)}.`) :
    `${clicks(S.clicks)}, ${diff === 0 ? 'matching the known route' : diff < 0 ? `${-diff} fewer than the known route` : `${diff} more than the known route`}.`;
  const chain = (p, reached) => `<ol class="chain">${p.map((t, i) => `<li class="${i === p.length - 1 ? (reached ? 'end' : 'stop') : ''}">${esc(t)}</li>`).join('')}</ol>`;
  const rows = standings();
  return `<section class="results">
    <h1>${head}</h1>
    <p class="sub">${sub}</p>
    <div class="routes">
      <div><h2>Your route</h2>${chain(S.path, !S.gaveUp)}</div>
      <div><h2>A known route</h2>${chain(c.optimal, true)}</div>
    </div>
    ${S.mode === 'room' ? `<h2>Room standings</h2><div class="tbl"><table class="wikitable"><thead><tr><th scope="col">#</th><th scope="col">Player</th><th scope="col">Result</th><th scope="col">Clicks</th></tr></thead><tbody>
      ${rows.map((r, i) => `<tr class="${r.id === S.me ? 'you' : ''}"><td class="n">${i + 1}</td><td>${esc(r.name)}${r.id === S.me ? ' (you)' : ''}</td><td>${r.finishedMs != null ? fmt(r.finishedMs) : r.gaveUp ? 'Gave up' : `Still racing, on ${esc(r.article)}`}</td><td class="n">${r.hops}</td></tr>`).join('')}
    </tbody></table></div>` : ''}
    <div class="actions">
      ${S.mode === 'room' ? `<button class="btn primary" data-act="lobby">Back to room</button>` : `<button class="btn primary" data-act="solo">Play again</button>`}
      <button class="btn" data-act="home">New challenge</button>
    </div>
  </section>`;
}
function render() {
  const view = { home: viewHome, lobby: viewLobby, race: viewRace, results: viewResults }[S.screen];
  $('#app').innerHTML = `<div class="wrap">${viewHeader()}<main>${view()}</main></div>`;
  if (S.screen === 'home' && S.challenge) loadBoard();
}
async function loadBoard() {
  const ch = S.challenge; if (!ch) return;
  const rows = await Api.leaderboard(ch), el = $('#lb');
  if (el && S.challenge === ch) el.innerHTML = viewBoard(rows);
}

/* ---------- race ---------- */
function beginRace(startsAt, challenge) {
  if (challenge) S.challenge = challenge;
  Object.assign(S, { racers: {}, path: [S.challenge.start], clicks: 0, finishedMs: null, gaveUp: false, startAt: startsAt, screen: 'race' });
  if (!S.players.length) S.players = [{ id: S.me, name: myName(), host: true }];
  S.players.forEach(p => racer(p.id));
  render(); loadArticle(S.challenge.start); updateTrail(); renderRacers(); runCountdown(); requestAnimationFrame(tick);
}
function tick() {
  if (S.screen !== 'race') return;
  const t = $('#timer'); if (t) t.textContent = fmt(Math.max(0, Date.now() - S.startAt));
  requestAnimationFrame(tick);
}
function runCountdown() {
  const el = $('#countdown'), num = el.querySelector('b'); el.hidden = false;
  const step = () => {
    if (S.screen !== 'race') return;
    const left = S.startAt - Date.now();
    if (left <= 0) { el.hidden = true; const a = $('#article a.wl'); a && a.focus({ preventScroll: true }); return; }
    const n = String(Math.ceil(left / 1000));
    if (num.textContent !== n) { num.textContent = n; num.classList.remove('pop'); void num.offsetWidth; num.classList.add('pop'); }
    requestAnimationFrame(step);
  };
  step();
}
async function loadArticle(title) {
  const el = $('#article'); if (!el) return null;
  if (CONFIG.live) el.innerHTML = `<p class="muted">Loading ${esc(title)}…</p>`;
  let a;
  try { a = await Wiki.get(title); } catch (e) { el.innerHTML = `<p>${esc(e.message || 'This article could not be loaded.')} Use Back to return.</p>`; return null; }
  if (S.screen !== 'race' || norm(S.path[S.path.length - 1]) !== norm(title)) return null;
  el.innerHTML = `<h1>${esc(a.title)}</h1><p class="src">From Wikipedia, the free encyclopedia</p>${a.html}${a.cat ? `<div class="cats">Category: ${esc(a.cat)}</div>` : ''}`;
  const seen = new Set(S.path.map(norm)), target = norm(S.challenge.target);
  el.querySelectorAll('a.wl').forEach(l => {
    const to = norm(l.dataset.to);
    if (to === target) { l.classList.add('target'); l.setAttribute('aria-label', `${l.textContent} (target)`); }
    else if (seen.has(to)) l.classList.add('visited');
  });
  const top = el.getBoundingClientRect().top; if (top < 0) window.scrollBy({ top: top - 90 });
  return a.title;
}
async function hop(to) {
  if (S.screen !== 'race' || S.finishedMs != null || Date.now() < S.startAt) return;
  S.path.push(to); S.clicks++;
  sock.send({ type: 'hop', article: to, hops: S.clicks });
  $('#clicks').textContent = S.clicks; $('#backbtn').disabled = false; updateTrail();
  const real = await loadArticle(to);
  if (real && S.path[S.path.length - 1] === to) { S.path[S.path.length - 1] = real; updateTrail(); }
  if (real && norm(real) === norm(S.challenge.target)) finish();
}
function finish() {
  S.finishedMs = Date.now() - S.startAt;
  sock.send({ type: 'finish', ms: S.finishedMs, path: S.path });
  Api.submit({ challengeId: S.challenge.id, name: myName(), ms: S.finishedMs, hops: S.clicks, path: S.path });
  S.screen = 'results'; render(); window.scrollTo({ top: 0 });
}
function updateTrail() {
  const ol = $('#trail'); if (!ol) return;
  ol.innerHTML = S.path.map((t, i) => `<li class="${i === S.path.length - 1 ? 'cur' : ''}">${esc(t)}</li>`).join('');
}
function renderRacers() {
  const ul = $('#racers'); if (!ul) return;
  const par = S.challenge.par;
  ul.innerHTML = standings().map(r => {
    const done = r.finishedMs != null;
    const pct = done ? 100 : r.dist != null && par ? Math.max(3, Math.round(Math.max(0, (par - r.dist) / par) * 100)) : Math.min(90, Math.round(r.hops / (par + 2) * 100));
    const st = done ? `Finished in ${fmt(r.finishedMs)}, ${clicks(r.hops)}` : r.gaveUp ? 'Gave up' : `${clicks(r.hops)}, on ${esc(r.article)}`;
    return `<li class="${done ? 'done' : r.gaveUp ? 'out' : ''}"><div class="row"><span class="nm">${esc(r.name)}${r.id === S.me ? ' (you)' : ''}</span></div><div class="st">${st}</div><div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${esc(r.name)} progress"><i style="width:${pct}%"></i></div></li>`;
  }).join('');
}
function refreshRacers() { if (S.screen === 'race') renderRacers(); else if (S.screen === 'results') render(); }

/* ---------- actions ---------- */
let shuffleTok = 0;
const actions = {
  home() { if (sock) { sock.send({ type: 'leave' }); sock.close(); sock = null; } S.screen = 'home'; S.players = []; actions.shuffle(); },
  async shuffle() {
    const tok = ++shuffleTok; S.loading = true; if (S.screen === 'home') render();
    try { const c = await Api.challenge(S.difficulty); if (tok === shuffleTok) S.challenge = c; }
    catch (e) { if (tok === shuffleTok) toast(e.message || 'Could not reach Wikipedia.'); }
    if (tok !== shuffleTok) return;
    S.loading = false; if (S.screen === 'home') render();
  },
  diff(b) { S.difficulty = b.dataset.diff; actions.shuffle(); },
  solo() { if (!S.challenge) return; S.mode = 'solo'; S.players = []; connect(); sock.send({ type: 'create', name: myName(), challenge: S.challenge, solo: true }); sock.send({ type: 'start' }); },
  host() { if (!S.challenge) return; S.mode = 'room'; S.players = []; S.room = null; connect(); sock.send({ type: 'create', name: myName(), challenge: S.challenge }); S.screen = 'lobby'; render(); },
  join() {
    if (!S.challenge) return;
    const code = ($('#code').value || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(code)) { toast('Room codes are 4 letters or numbers.'); $('#code').focus(); return; }
    S.mode = 'room'; S.players = []; S.room = code; connect();
    sock.send({ type: 'join', code, name: myName(), challenge: S.challenge }); S.screen = 'lobby'; render();
  },
  start() { sock.send({ type: 'start' }); },
  lobby() { S.screen = 'lobby'; render(); sock.send({ type: 'ready' }); },
  leave() { actions.home(); },
  back() { if (S.path.length > 1) hop(S.path[S.path.length - 2]); },
  giveup() {
    if (S.finishedMs != null) return;
    S.gaveUp = true; sock.send({ type: 'forfeit' }); racer(S.me).gaveUp = true;
    S.screen = 'results'; render(); window.scrollTo({ top: 0 });
  },
};
document.addEventListener('click', e => {
  const link = e.target.closest('a.wl');
  if (link) { e.preventDefault(); hop(link.dataset.to); return; }
  const b = e.target.closest('[data-act]');
  if (b && !b.disabled) actions[b.dataset.act](b);
});
document.addEventListener('input', e => {
  if (e.target.id === 'name') { S.name = e.target.value; store.set('wr-name', S.name); }
  if (e.target.id === 'code') e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'code') actions.join(); });

actions.shuffle();
