/* =========================================================
   GEODA — Defiende el Núcleo · v3 "Edición Abisal"
   Motor del juego. Los datos y fórmulas viven en data.js
   (GeodaData), compartidos con tools/balance-sim.js.
   ========================================================= */
"use strict";

const D = window.GeodaData;
const ECON = D.ECON;

// ---------- Utilidades ----------
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);            // ruido visual (no determinista)
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const pick = (arr) => arr[randInt(0, arr.length - 1)];
const hash2 = (a, b) => ((Math.imul(a, 2654435761) ^ Math.imul(b + 1, 97531)) >>> 0);

const WIN_WAVE = ECON.winWave;
const MAX_LEVEL = ECON.maxLevel;
const SAVE_KEY = "geoda_save_v3";
const META_KEY = "geoda_meta_v2"; // se conserva la clave: los campos nuevos se fusionan
const pointerCoarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

// ---------- Meta-progresión persistente ----------
function loadMeta() {
  const def = {
    fragments: 0,
    upgrades: { core: 0, energy: 0, dmg: 0, cdr: 0, discount: 0 },
    ach: {},
    best: Number(localStorage.getItem("geoda_best") || 0),
    totalKills: 0,
    muted: localStorage.getItem("geoda_muted") === "1",
    volume: 1,
    settings: { shake: true, reduced: false, cb: false, textScale: 1, lang: "es" },
    history: [],
    daily: null,           // { date: "2026-07-03", best: 1234 }
    tutorialDone: false,
  };
  try {
    const raw = localStorage.getItem(META_KEY);
    if (raw) {
      const m = JSON.parse(raw);
      return {
        ...def, ...m,
        upgrades: { ...def.upgrades, ...(m.upgrades || {}) },
        settings: { ...def.settings, ...(m.settings || {}) },
        ach: m.ach || {},
        history: Array.isArray(m.history) ? m.history : [],
      };
    }
  } catch (e) { /* meta corrupta: empezar de cero */ }
  return def;
}
const meta = loadMeta();
function metaSave() { localStorage.setItem(META_KEY, JSON.stringify(meta)); }

const metaCoreHp = () => ECON.coreHp + 15 * meta.upgrades.core;
const metaStartEnergy = () => ECON.startEnergy + 30 * meta.upgrades.energy;
const metaDmgMult = () => 1 + 0.05 * meta.upgrades.dmg;
const metaCdrMult = () => 1 - 0.10 * meta.upgrades.cdr;
const metaCostMult = () => 1 - 0.05 * meta.upgrades.discount;

// ---------- i18n ----------
function L() { return meta.settings.lang === "en" ? "en" : "es"; }
function t(key, ...args) {
  const v = D.STRINGS[L()][key];
  return typeof v === "function" ? v(...args) : (v !== undefined ? v : key);
}
function tn(obj) { return obj && typeof obj === "object" ? (obj[L()] || obj.es) : obj; } // nombres de data.js

// ---------- Estado ----------
const state = {
  running: false, gameOver: false, paused: false, drafting: false,
  endless: false, daily: false, seed: 0,
  difficulty: "normal",
  energy: 0, score: 0, wave: 0,
  coreHp: 100, coreMaxHp: 100, corePulse: 0,
  selectedType: "ruby",
  phase: "build", autoStartTimer: 0,
  cooldowns: { pulse: 0, storm: 0, shield: 0, over: 0 },
  shieldUntil: 0, overUntil: 0,
  spawnQueue: [], waveTotal: 0, waveDamageTaken: 0, waveDmgMark: 0, spawnTimer: 0,
  waveRng: Math.random, mutator: null,
  relics: [],
  rocks: [], spots: [],
  towers: [], enemies: [], projectiles: [], particles: [], gems: [],
  beams: [], texts: [], shockwaves: [], timers: [],
  waveLog: [],
  combo: 0, comboTimer: 0,
  time: 0, shake: 0,
  hoverTower: null, mouseX: 0, mouseY: 0,
  tutStep: 0,
  stats: null,
};
function freshStats() {
  return { kills: 0, dmgDealt: 0, towersBuilt: 0, perfectWaves: 0, gems: 0, crits: 0, dmgByType: {} };
}
state.stats = freshStats();

const hasRelic = (id) => state.relics.includes(id);
const relicCostMult = () => hasRelic("market") ? 0.9 : 1;
const relicDmgMult = () => hasRelic("fang") ? 1.08 : 1;
const relicRangeMult = () => hasRelic("sniper") ? 1.1 : 1;
const relicCdMult = () => hasRelic("reactor") ? 0.85 : 1;
const comboWindow = () => 2.2 + (hasRelic("adrenaline") ? 1 : 0);
const gemRadius = () => hasRelic("magnet") ? 126 : 42;
const gemValue = () => ECON.gemValue + (hasRelic("magnet") ? 3 : 0);

// ---------- Canvas + HiDPI ----------
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
let W = 0, H = 0, CX = 0, CY = 0, DPR = 1;

function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  CX = W / 2;
  CY = H / 2;
  buildBackdrop();
}
window.addEventListener("resize", resize);

// ---------- Audio ----------
let audioCtx = null, masterGain = null, musicGain = null, bossGain = null;

function ensureAudio() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = meta.volume;
      masterGain.connect(audioCtx.destination);
      startMusic();
    } catch (e) { audioCtx = null; }
  }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
}

function startMusic() {
  if (!audioCtx || musicGain) return;
  musicGain = audioCtx.createGain();
  musicGain.gain.value = meta.muted ? 0 : 0.035;
  musicGain.connect(masterGain);
  [55, 55.6, 110.3].forEach((f, i) => {
    const osc = audioCtx.createOscillator();
    osc.type = i === 2 ? "sine" : "triangle";
    osc.frequency.value = f;
    const g = audioCtx.createGain();
    g.gain.value = i === 2 ? 0.4 : 1;
    const lfo = audioCtx.createOscillator();
    lfo.frequency.value = 0.06 + i * 0.04;
    const lfoGain = audioCtx.createGain();
    lfoGain.gain.value = 0.3;
    lfo.connect(lfoGain).connect(g.gain);
    osc.connect(g).connect(musicGain);
    osc.start();
    lfo.start();
  });
  bossGain = audioCtx.createGain();
  bossGain.gain.value = 0;
  bossGain.connect(masterGain);
  const bosc = audioCtx.createOscillator();
  bosc.type = "sawtooth";
  bosc.frequency.value = 55;
  const trem = audioCtx.createOscillator();
  trem.frequency.value = 3.2;
  const tremGain = audioCtx.createGain();
  tremGain.gain.value = 0.5;
  const carrier = audioCtx.createGain();
  carrier.gain.value = 0.6;
  trem.connect(tremGain).connect(carrier.gain);
  bosc.connect(carrier).connect(bossGain);
  bosc.start();
  trem.start();
}

function setBossMusic(on) {
  if (!bossGain) return;
  const tt = audioCtx.currentTime;
  bossGain.gain.cancelScheduledValues(tt);
  bossGain.gain.linearRampToValueAtTime(on && !meta.muted ? 0.03 : 0, tt + 1.2);
}

function toggleMute() {
  meta.muted = !meta.muted;
  metaSave();
  if (musicGain) musicGain.gain.value = meta.muted ? 0 : 0.035;
  if (bossGain && meta.muted) bossGain.gain.value = 0;
  showToast("🔊", meta.muted ? t("muted") : t("unmuted"), "M");
  if (!meta.muted) beep(660, 0.1, "sine", 0.06, 100);
}

function setVolume(v) {
  meta.volume = clamp(Math.round(v * 10) / 10, 0, 1);
  metaSave();
  if (masterGain) masterGain.gain.value = meta.volume;
}

function beep(freq, dur, type, vol, slide) {
  if (!audioCtx || meta.muted) return;
  const t0 = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type || "sine";
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  gain.gain.setValueAtTime(vol || 0.08, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(masterGain);
  osc.start(t0);
  osc.stop(t0 + dur);
}
const sfx = {
  shoot: () => beep(rand(820, 940), 0.07, "square", 0.02, -300),
  hit: () => beep(rand(180, 240), 0.08, "sawtooth", 0.03, -80),
  death: () => beep(140, 0.22, "triangle", 0.05, -90),
  place: () => beep(520, 0.15, "sine", 0.07, 240),
  upgrade: () => { beep(600, 0.1, "sine", 0.06, 200); setTimeout(() => beep(900, 0.12, "sine", 0.06, 250), 90); },
  evolve: () => { beep(500, 0.14, "sine", 0.07, 260); setTimeout(() => beep(750, 0.14, "sine", 0.07, 260), 120); setTimeout(() => beep(1100, 0.3, "sine", 0.07, 300), 240); },
  error: () => beep(160, 0.18, "square", 0.05, -40),
  coreHit: () => beep(90, 0.35, "sawtooth", 0.1, -40),
  pulse: () => beep(70, 0.5, "sawtooth", 0.12, 160),
  wave: () => { beep(330, 0.16, "sine", 0.07, 80); setTimeout(() => beep(440, 0.2, "sine", 0.07, 100), 140); },
  boss: () => { beep(80, 0.6, "sawtooth", 0.12, -30); setTimeout(() => beep(60, 0.8, "sawtooth", 0.12, -20), 250); },
  zap: () => beep(rand(1200, 1500), 0.1, "sawtooth", 0.035, -900),
  meteor: () => beep(220, 0.3, "sawtooth", 0.07, -150),
  shield: () => beep(280, 0.6, "sine", 0.09, 300),
  over: () => { beep(440, 0.12, "square", 0.05, 200); setTimeout(() => beep(660, 0.15, "square", 0.05, 250), 100); },
  coin: () => beep(rand(1000, 1200), 0.12, "sine", 0.05, 400),
  achieve: () => { beep(520, 0.12, "sine", 0.07, 0); setTimeout(() => beep(660, 0.12, "sine", 0.07, 0), 110); setTimeout(() => beep(880, 0.25, "sine", 0.07, 0), 220); },
  crit: () => beep(1400, 0.09, "square", 0.03, -400),
  stun: () => beep(120, 0.4, "square", 0.06, -60),
  relic: () => { beep(392, 0.15, "sine", 0.08, 0); setTimeout(() => beep(523, 0.15, "sine", 0.08, 0), 130); setTimeout(() => beep(784, 0.35, "sine", 0.08, 0), 260); },
  freeze: () => beep(1800, 0.15, "sine", 0.04, -600),
};

// ---------- Logros ----------
function unlockAchievement(id) {
  if (meta.ach[id]) return;
  const a = D.ACHIEVEMENTS.find(x => x.id === id);
  if (!a) return;
  meta.ach[id] = true;
  meta.fragments += a.frag;
  metaSave();
  showToast(a.icon, `${t("achievement")}: ${tn(a.name)}`, `${tn(a.desc)} · +${a.frag} 💠`);
  sfx.achieve();
  updateHUD();
}

const diff = () => D.DIFFICULTIES[state.difficulty];

// ---------- Rejilla espacial (spatial hash) ----------
const GRID = 96;
const grid = new Map();
function rebuildGrid() {
  grid.clear();
  for (const e of state.enemies) {
    if (e.dead) continue;
    const k = Math.floor(e.x / GRID) * 4096 + Math.floor(e.y / GRID);
    let cell = grid.get(k);
    if (!cell) { cell = []; grid.set(k, cell); }
    cell.push(e);
  }
}
function forEnemiesNear(x, y, r, fn) {
  const x0 = Math.floor((x - r) / GRID), x1 = Math.floor((x + r) / GRID);
  const y0 = Math.floor((y - r) / GRID), y1 = Math.floor((y + r) / GRID);
  for (let cx = x0; cx <= x1; cx++) {
    for (let cy = y0; cy <= y1; cy++) {
      const cell = grid.get(cx * 4096 + cy);
      if (!cell) continue;
      for (let i = 0; i < cell.length; i++) fn(cell[i]);
    }
  }
}

// ---------- Pool de partículas ----------
const pPool = [];
let fpsEma = 60;
function particleBudget() {
  if (meta.settings.reduced) return 120;
  return fpsEma < 45 ? 200 : 420;
}
function emit(x, y, vx, vy, life, size, color) {
  if (state.particles.length >= particleBudget()) return;
  const p = pPool.pop() || {};
  p.x = x; p.y = y; p.vx = vx; p.vy = vy;
  p.life = life; p.maxLife = life; p.size = size; p.color = color;
  state.particles.push(p);
}
function burst(x, y, color, n, speed) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU);
    const s = rand(30, 90) * speed / 3;
    emit(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.35, 0.8), rand(1.5, 4), color);
  }
}
function updateParticles(dt) {
  const arr = state.particles;
  for (let i = arr.length - 1; i >= 0; i--) {
    const p = arr[i];
    p.life -= dt;
    if (p.life <= 0) {
      const last = arr.pop();
      if (i < arr.length) arr[i] = last;
      pPool.push(p);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.96; p.vy *= 0.96;
  }
}

function addText(x, y, str, color, size) {
  state.texts.push({ x, y, str, color, size: (size || 14) * meta.settings.textScale, life: 1.2 });
}
function addTimer(delay, fn) { state.timers.push({ t: state.time + delay, fn }); }

// ---------- Terreno procedural (rocas y vetas de poder) ----------
function genTerrain() {
  const rng = D.mulberry32(hash2(state.seed, 777));
  const rr = (a, b) => a + rng() * (b - a);
  state.rocks = [];
  const nRocks = 4 + Math.floor(rng() * 4);
  for (let tries = 0; tries < 80 && state.rocks.length < nRocks; tries++) {
    const r = rr(26, 58);
    const x = rr(70, W - 70), y = rr(90, H - 150);
    if (dist2(x, y, CX, CY) < (200 + r) * (200 + r)) continue;
    if (state.rocks.some(o => dist2(x, y, o.x, o.y) < (r + o.r + 70) * (r + o.r + 70))) continue;
    const pts = [];
    const n = 7 + Math.floor(rng() * 4);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      pts.push([Math.cos(a) * r * rr(0.75, 1.15), Math.sin(a) * r * rr(0.75, 1.15)]);
    }
    state.rocks.push({ x, y, r, pts, hue: 230 + Math.floor(rng() * 60) });
  }
  state.spots = [];
  const nSpots = 3 + Math.floor(rng() * 3);
  for (let tries = 0; tries < 80 && state.spots.length < nSpots; tries++) {
    const x = rr(80, W - 80), y = rr(100, H - 160);
    if (dist2(x, y, CX, CY) < 150 * 150) continue;
    if (dist2(x, y, CX, CY) > Math.pow(Math.min(W, H) * 0.48, 2)) continue;
    if (state.spots.some(o => dist2(x, y, o.x, o.y) < 130 * 130)) continue;
    if (state.rocks.some(o => dist2(x, y, o.x, o.y) < (o.r + 60) * (o.r + 60))) continue;
    state.spots.push({ x, y, r: 26, seed: rng() * TAU });
  }
}

// ---------- Fondo pre-renderizado ----------
let backdrop = null;
let fireflies = [];
let crackSegs = [];

function buildBackdrop() {
  backdrop = document.createElement("canvas");
  backdrop.width = Math.round(W * DPR);
  backdrop.height = Math.round(H * DPR);
  const b = backdrop.getContext("2d");
  b.scale(DPR, DPR);

  const grad = b.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, Math.max(W, H) * 0.75);
  grad.addColorStop(0, "#181530");
  grad.addColorStop(0.55, "#0e0c1e");
  grad.addColorStop(1, "#070610");
  b.fillStyle = grad;
  b.fillRect(0, 0, W, H);

  for (let i = 0; i < 46; i++) {
    const x = Math.random() * W, y = Math.random() * H;
    if (dist2(x, y, W / 2, H / 2) < 200 * 200) continue;
    const s = rand(3, 10);
    const hue = randInt(230, 300);
    b.save();
    b.translate(x, y);
    b.rotate(rand(0, TAU));
    b.globalAlpha = rand(0.12, 0.4);
    b.fillStyle = `hsl(${hue}, 70%, 60%)`;
    b.beginPath();
    b.moveTo(0, -s * 1.6); b.lineTo(s, 0); b.lineTo(0, s * 1.6); b.lineTo(-s, 0);
    b.closePath();
    b.fill();
    b.restore();
  }
  for (let i = 0; i < 90; i++) {
    b.globalAlpha = rand(0.04, 0.18);
    b.fillStyle = "#cfc6ff";
    b.beginPath();
    b.arc(Math.random() * W, Math.random() * H, rand(0.5, 1.6), 0, TAU);
    b.fill();
  }
  b.globalAlpha = 1;

  // Rocas del terreno (fijas durante la partida)
  for (const rock of state.rocks) {
    b.save();
    b.translate(rock.x, rock.y);
    b.beginPath();
    rock.pts.forEach(([px, py], i) => i === 0 ? b.moveTo(px, py) : b.lineTo(px, py));
    b.closePath();
    const g = b.createLinearGradient(-rock.r, -rock.r, rock.r, rock.r);
    g.addColorStop(0, `hsl(${rock.hue}, 22%, 24%)`);
    g.addColorStop(1, `hsl(${rock.hue}, 26%, 10%)`);
    b.fillStyle = g;
    b.fill();
    b.strokeStyle = `hsla(${rock.hue}, 45%, 55%, 0.35)`;
    b.lineWidth = 1.5;
    b.stroke();
    // vetas brillantes
    b.strokeStyle = `hsla(${rock.hue + 20}, 70%, 70%, 0.25)`;
    b.beginPath();
    b.moveTo(-rock.r * 0.4, -rock.r * 0.3);
    b.lineTo(rock.r * 0.1, rock.r * 0.2);
    b.lineTo(rock.r * 0.45, -rock.r * 0.1);
    b.stroke();
    b.restore();
  }

  fireflies = [];
  for (let i = 0; i < 26; i++) {
    fireflies.push({
      x: Math.random() * W, y: Math.random() * H,
      seed: rand(0, TAU), speed: rand(6, 18),
      size: rand(1, 2.4), hue: randInt(160, 300),
    });
  }
}

function buildCracks() {
  crackSegs = [];
  for (let i = 0; i < 6; i++) {
    const pts = [];
    let a = rand(0, TAU);
    let r = rand(0.1, 0.3);
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    while (r < 1) {
      r += rand(0.15, 0.3);
      a += rand(-0.7, 0.7);
      pts.push([Math.cos(a) * Math.min(1, r), Math.sin(a) * Math.min(1, r)]);
    }
    crackSegs.push(pts);
  }
}
buildCracks();

// ---------- Oleadas ----------
const isBossWave = (n) => n % 5 === 0;

// Mutador por oleada: función pura de (semilla, oleada) => previsible y determinista
function mutatorForWave(n) {
  if (n < D.MUTATOR_MIN_WAVE || isBossWave(n)) return null;
  const rng = D.mulberry32(hash2(state.seed, n * 31 + 7));
  if (rng() > D.MUTATOR_CHANCE) return null;
  const keys = Object.keys(D.MUTATORS);
  return D.MUTATORS[keys[Math.floor(rng() * keys.length)]];
}

function buildQueue(n) {
  const c = D.waveComposition(n);
  const mut = mutatorForWave(n);
  const list = [];
  for (const type in c) {
    let k = c[type];
    if (mut && mut.count && type !== "boss" && type !== "mega") k = Math.round(k * mut.count);
    for (let i = 0; i < k; i++) list.push(type);
  }
  const rng = state.waveRng;
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function startWave(manual) {
  if (manual && state.autoStartTimer > 0) {
    const bonus = Math.floor(state.autoStartTimer / ECON.earlyBonusDiv);
    if (bonus > 0) {
      state.energy += bonus;
      addText(CX, CY - 78, t("earlyBonus", bonus), "#ffe08a", 14);
    }
  }
  state.wave++;
  state.waveRng = D.mulberry32(hash2(state.seed, state.wave));
  state.mutator = mutatorForWave(state.wave);
  state.phase = "wave";
  state.spawnQueue = buildQueue(state.wave);
  state.waveTotal = state.spawnQueue.length;
  state.waveDamageTaken = 0;
  state.waveDmgMark = state.stats.dmgDealt;
  state.spawnTimer = 0.8;
  nextWaveBtn.style.display = "none";
  wavePreview.style.display = "none";
  waveProgressWrap.style.display = "block";
  const boss = isBossWave(state.wave);
  let sub = state.wave % 10 === 0 ? t("megaComing") : boss ? t("bossComing") : "";
  if (state.mutator) sub = `${state.mutator.icon} ${tn(state.mutator.name)}: ${tn(state.mutator.desc)}`;
  showBanner(boss ? `⚠ ${t("waveN").toUpperCase()} ${state.wave} ⚠` : `${t("waveN").toUpperCase()} ${state.wave}`, sub);
  (boss ? sfx.boss : sfx.wave)();
  setBossMusic(boss);
  if (state.wave >= 10) unlockAchievement("vet");
  if (state.tutStep === 3) setTutStep(4);
  refreshToolbar();
  refreshAbilityBar();
  updateHUD();
}

function endWave() {
  state.phase = "build";
  state.mutator = null;
  state.autoStartTimer = 20;
  const bonus = ECON.waveBonus(state.wave);
  const rate = hasRelic("treasurer") ? 0.07 : ECON.interestRate;
  const cap = hasRelic("treasurer") ? 80 : ECON.interestCap;
  const interest = Math.min(cap, Math.floor(state.energy * rate));
  state.energy += bonus + interest;
  addScore(state.wave * 20);
  addText(CX, CY - 60, t("waveCleared", bonus), "#52e5a5", 16);
  if (interest > 0) addText(CX, CY - 80, t("interest", interest), "#ffe08a", 13);
  if (state.waveDamageTaken === 0) {
    state.energy += ECON.perfectBonus;
    state.stats.perfectWaves++;
    addText(CX, CY - 100, t("perfectWave"), "#ffc94a", 14);
    unlockAchievement("perfect");
  }
  state.coreHp = Math.min(state.coreMaxHp, state.coreHp + ECON.coreRegenPerWave);
  setBossMusic(false);
  state.waveLog.push({
    w: state.wave,
    dealt: Math.round(state.stats.dmgDealt - state.waveDmgMark),
    taken: state.waveDamageTaken,
  });
  if (state.waveLog.length > 40) state.waveLog.shift();
  if (state.tutStep === 4) finishTutorial();

  if (state.wave >= WIN_WAVE && !state.endless) { victory(); return; }

  nextWaveBtn.style.display = "block";
  waveProgressWrap.style.display = "none";
  showWavePreview();
  saveGame();
  refreshToolbar();
  refreshAbilityBar();
  updateHUD();

  // Draft de reliquia cada 3 oleadas
  if (state.wave % D.RELIC_INTERVAL === 0) openDraft();
}

// ---------- Aparición de enemigos ----------
function makeEnemy(typeName, x, y, opts) {
  const base = D.ENEMY_TYPES[typeName];
  const d = diff();
  const mut = state.mutator;
  const rng = state.waveRng;
  let hpMult = ECON.hpMultiplier(state.wave) * d.hp * ((opts && opts.hpMult) || 1);
  let speedMult = d.speed;
  if (mut) {
    if (mut.hp) hpMult *= mut.hp;
    if (mut.speed) speedMult *= mut.speed;
  }
  const e = {
    type: typeName, x, y,
    hp: base.hp * hpMult, maxHp: base.hp * hpMult,
    speed: base.speed * (0.9 + rng() * 0.2) * speedMult,
    radius: base.radius, dmg: base.dmg,
    bounty: Math.round(base.bounty * d.bounty * ((mut && mut.bounty) || 1)),
    score: base.score, color: base.color, shape: base.shape,
    splits: base.splits || 0,
    slowImmune: !!base.slowImmune, critImmune: !!base.critImmune,
    mega: !!base.mega,
    slowUntil: 0, slowFactor: 1, stasisUntil: 0,
    burnUntil: 0, burnDps: 0, burnSrc: null,
    shieldHits: 0, lastShieldHit: 0,
    wobbleSeed: rand(0, TAU), hitFlash: 0, phased: false, spawnAnim: 0,
    elite: false, affix: null, bossKind: null, enraged: false,
  };
  if (typeName === "healer") e.nextHeal = state.time + 0.5;
  if (typeName === "digger") {
    e.burrowed = false; e.emerged = false;
    e.burrowAt = Math.sqrt(dist2(x, y, CX, CY)) * 0.65;
  }
  if (e.shape === "boss") {
    e.nextPulse = state.time + 5;
    if (e.mega) e.nextSummon = state.time + 6;
    else {
      e.bossKind = D.bossKindForWave(state.wave);
      if (e.bossKind === "weaver") e.nextWeave = state.time + 5;
      if (e.bossKind === "colossus") { e.nextShield = state.time + 3; }
    }
  }
  // Élites con afijo (deterministas dentro de la oleada)
  if (opts && opts.canElite && state.wave >= 7 && e.shape !== "boss" && rng() < 0.12) {
    e.elite = true;
    e.hp *= 2.2; e.maxHp *= 2.2;
    e.bounty *= 2; e.score *= 2;
    e.radius *= 1.15;
    const keys = Object.keys(D.ELITE_AFFIXES);
    e.affix = keys[Math.floor(rng() * keys.length)];
    if (e.affix === "swift") e.speed *= 1.4;
    if (e.affix === "shielded") e.shieldHits = 5;
  }
  return e;
}

function spawnEnemy(typeName) {
  const rng = state.waveRng;
  const side = Math.floor(rng() * 4);
  const m = 40;
  let x, y;
  if (side === 0) { x = rng() * W; y = -m; }
  else if (side === 1) { x = W + m; y = rng() * H; }
  else if (side === 2) { x = rng() * W; y = H + m; }
  else { x = -m; y = rng() * H; }
  state.enemies.push(makeEnemy(typeName, x, y, { canElite: true }));
}

function spawnEnemyAt(typeName, x, y, opts) {
  state.enemies.push(makeEnemy(typeName, x, y, opts || {}));
}

function spawnSplitChildren(parent) {
  for (let i = 0; i < parent.splits; i++) {
    const e = makeEnemy("mote", parent.x + rand(-14, 14), parent.y + rand(-14, 14), { hpMult: 0.6 });
    e.speed *= 1.25; e.radius *= 0.8;
    e.bounty = 4; e.score = 5;
    e.color = "#f0a8ff"; e.spawnAnim = 1;
    state.enemies.push(e);
  }
}

// ---------- Torres ----------
const towerCost = (type) => Math.round(D.TOWER_TYPES[type].cost * metaCostMult() * relicCostMult());
const upgradeCostOf = (tw) => Math.round(ECON.upgradeCost(D.TOWER_TYPES[tw.type].cost, tw.level) * metaCostMult() * relicCostMult());
const evolveCost = () => Math.round(D.EVOLUTION_COST * metaCostMult() * relicCostMult());
const vetMult = (tw) => 1 + Math.min(ECON.vetCap, Math.floor(tw.kills / ECON.vetKillsPerStep) * ECON.vetStepBonus);

// Sinergias de adyacencia: cada tipo vecino único aporta su bonificación
function synergyFor(tw) {
  const out = { dmg: 1, rate: 1, range: 1, crit: 0, critDmg: 0, stunImmune: false, list: [] };
  const R2 = D.SYNERGY_RADIUS * D.SYNERGY_RADIUS;
  const seen = new Set();
  for (const o of state.towers) {
    if (o === tw || seen.has(o.type)) continue;
    if (dist2(tw.x, tw.y, o.x, o.y) > R2) continue;
    seen.add(o.type);
    const s = D.SYNERGIES[o.type];
    if (!s) continue;
    if (s.stat === "dmg") out.dmg *= s.mult;
    else if (s.stat === "rate") out.rate *= s.mult;
    else if (s.stat === "range") out.range *= s.mult;
    else if (s.stat === "crit") out.crit += s.add;
    else if (s.stat === "critDmg") out.critDmg += s.add;
    else if (s.stat === "stunImmune") out.stunImmune = true;
    out.list.push(o.type);
  }
  return out;
}

function towerStats(tw) {
  const base = D.TOWER_TYPES[tw.type];
  const lv = tw.level;
  const syn = synergyFor(tw);
  let dmg = base.dmg * (1 + ECON.levelDmg * lv) * vetMult(tw) * metaDmgMult() * relicDmgMult() * syn.dmg;
  if (tw.empowered) dmg *= ECON.powerSpotBonus;
  let range = base.range * (1 + ECON.levelRange * lv) * relicRangeMult() * syn.range;
  if (tw.evo === "ballista") range *= 1.3;
  if (state.mutator && state.mutator.towerRange) range *= state.mutator.towerRange;
  const rate = (base.rate || 1) * Math.pow(ECON.levelRate, lv) * syn.rate;
  return { dmg, range, rate, syn };
}
const critChance = (syn) => ECON.critChance + (syn ? syn.crit : 0);
const critMult = (syn) => ECON.critMult + (syn ? syn.critDmg : 0);

function inRock(x, y, pad) {
  return state.rocks.some(r => dist2(x, y, r.x, r.y) < (r.r + pad) * (r.r + pad));
}
function spotAt(x, y) {
  return state.spots.find(s => dist2(x, y, s.x, s.y) < s.r * s.r) || null;
}

function canPlaceAt(x, y) {
  if (x < 20 || y < 20 || x > W - 20 || y > H - 20) return false;
  if (dist2(x, y, CX, CY) < 78 * 78) return false;
  if (inRock(x, y, 18)) return false;
  for (const tw of state.towers) {
    if (dist2(x, y, tw.x, tw.y) < 44 * 44) return false;
  }
  return true;
}

function placeTower(x, y) {
  const type = state.selectedType;
  const def = D.TOWER_TYPES[type];
  const cost = towerCost(type);
  if (state.wave < def.unlockWave) { sfx.error(); return; }
  if (state.energy < cost) {
    sfx.error();
    addText(x, y, t("noEnergy"), "#ff5470", 13);
    shakeTowerBtn(type);
    return;
  }
  if (!canPlaceAt(x, y)) {
    sfx.error();
    addText(x, y, t("noPlace"), "#ff5470", 13);
    return;
  }
  state.energy -= cost;
  const tw = {
    type, x, y, level: 0, cooldown: 0, angle: rand(0, TAU), flash: 0,
    invested: cost, kills: 0, priority: "core", buildAnim: 0,
    stunUntil: 0, beamTarget: null, beamTime: 0, evo: null,
    empowered: !!spotAt(x, y),
  };
  state.towers.push(tw);
  state.stats.towersBuilt++;
  if (state.stats.towersBuilt >= 10) unlockAchievement("builder");
  sfx.place();
  burst(x, y, def.color, 14, 3);
  if (tw.empowered) addText(x, y - 26, "⛰ +25%", "#ffc94a", 13);
  if (state.tutStep === 1) setTutStep(2);
  refreshToolbar();
  updateHUD();
}

function tryUpgrade(tw) {
  if (tw.level >= MAX_LEVEL) {
    if (!tw.evo) { openEvolvePopup(tw); return; }
    addText(tw.x, tw.y - 24, t("maxLevel"), "#9a92c9", 13);
    sfx.error();
    return;
  }
  const cost = upgradeCostOf(tw);
  if (state.energy < cost) {
    addText(tw.x, tw.y - 24, t("needN", cost), "#ff5470", 13);
    sfx.error();
    return;
  }
  state.energy -= cost;
  tw.invested += cost;
  tw.level++;
  tw.flash = 1;
  sfx.upgrade();
  burst(tw.x, tw.y, "#ffffff", 18, 4);
  addText(tw.x, tw.y - 24, `${t("lvl")} ${tw.level + 1}`, D.TOWER_TYPES[tw.type].color, 14);
  if (state.tutStep === 2) setTutStep(3);
  refreshToolbar();
  updateHUD();
}

function evolveTower(tw, evoId) {
  const cost = evolveCost();
  if (state.energy < cost) {
    addText(tw.x, tw.y - 24, t("needN", cost), "#ff5470", 13);
    sfx.error();
    return false;
  }
  state.energy -= cost;
  tw.invested += cost;
  tw.evo = evoId;
  tw.flash = 1;
  sfx.evolve();
  burst(tw.x, tw.y, "#ffffff", 30, 5);
  state.shockwaves.push({ x: tw.x, y: tw.y, r: 6, max: 70, life: 0.7, color: D.TOWER_TYPES[tw.type].color });
  const evo = D.EVOLUTIONS[tw.type].find(e => e.id === evoId);
  addText(tw.x, tw.y - 26, `${evo.icon} ${tn(evo.name)}`, "#ffc94a", 15);
  refreshToolbar();
  updateHUD();
  return true;
}

function sellTower(tw) {
  const refund = Math.round(tw.invested * ECON.sellRefund);
  state.energy += refund;
  state.towers = state.towers.filter(x => x !== tw);
  state.hoverTower = null;
  hideTowerPopup();
  sfx.place();
  burst(tw.x, tw.y, "#9a92c9", 12, 3);
  addText(tw.x, tw.y - 20, t("sold", refund), "#ffe08a", 13);
  refreshToolbar();
  updateHUD();
}

const PRIORITIES = ["core", "strong", "weak"];
const prioLabel = (p) => t(p === "core" ? "prioCore" : p === "strong" ? "prioStrong" : "prioWeak");

function cyclePriority(tw) {
  const i = PRIORITIES.indexOf(tw.priority);
  tw.priority = PRIORITIES[(i + 1) % PRIORITIES.length];
  addText(tw.x, tw.y - 24, `${t("objLabel")}: ${prioLabel(tw.priority)}`, "#8c78ff", 12);
}

function towerAt(x, y) {
  for (const tw of state.towers) {
    if (dist2(x, y, tw.x, tw.y) < 24 * 24) return tw;
  }
  return null;
}

function targetable(e) {
  return !e.dead && !e.burrowed && !e.phased && e.spawnAnim > 0.25;
}

function pickTargets(tw, range, n) {
  const r2 = range * range;
  const cands = [];
  forEnemiesNear(tw.x, tw.y, range, (e) => {
    if (!targetable(e)) return;
    if (dist2(tw.x, tw.y, e.x, e.y) > r2) return;
    let val;
    if (tw.priority === "strong") val = -e.hp;
    else if (tw.priority === "weak") val = e.hp;
    else val = dist2(e.x, e.y, CX, CY);
    cands.push([val, e]);
  });
  cands.sort((a, b) => a[0] - b[0]);
  return cands.slice(0, n).map(c => c[1]);
}
function pickTarget(tw, range) {
  const arr = pickTargets(tw, range, 1);
  return arr.length ? arr[0] : null;
}

// ---------- Daño ----------
function rollHit(e, base, source, opts) {
  opts = opts || {};
  let dmg = base, crit = false;
  if (source && source.evo === "executioner" && e.hp < e.maxHp * 0.3) dmg *= 2.5;
  const syn = opts.syn || null;
  if (!e.critImmune && Math.random() < critChance(syn)) {
    dmg *= critMult(syn);
    crit = true;
    state.stats.crits++;
    if (state.stats.crits >= 50) unlockAchievement("crit");
    addText(e.x, e.y - e.radius - 14, "¡CRIT!", "#ffc94a", 12);
    sfx.crit();
    if (hasRelic("pyro") && !opts.noPyro) {
      const px = e.x, py = e.y, pd = base * 0.5, src = source;
      burst(px, py, "#ffc94a", 10, 4);
      forEnemiesNear(px, py, 40, (o) => {
        if (o !== e && targetable(o) && dist2(o.x, o.y, px, py) < 40 * 40) {
          rollHit(o, pd, src, { noPyro: true, noSpore: true });
        }
      });
    }
  }
  // Corazón Ígneo: quemadura
  if (source && source.evo === "ember") {
    e.burnUntil = state.time + 2;
    e.burnDps = base * 0.25;
    e.burnSrc = source;
  }
  // Escarcha eterna
  if (hasRelic("frost") && !e.slowImmune && (state.time > e.slowUntil || e.slowFactor > 0.85)) {
    e.slowUntil = state.time + 0.8;
    e.slowFactor = 0.85;
  }
  damageEnemy(e, dmg, source, opts);
  return crit;
}

function damageEnemy(e, dmg, source, opts) {
  if (e.dead || e.burrowed) return;
  opts = opts || {};
  // Escudo de impactos (Coloso / élites escudados)
  if (e.shieldHits > 0) {
    if (state.time - e.lastShieldHit > 0.08) {
      e.shieldHits--;
      e.lastShieldHit = state.time;
      burst(e.x, e.y, "#8fd4ff", 4, 2);
    }
    return;
  }
  e.hp -= dmg;
  state.stats.dmgDealt += dmg;
  const tag = source ? source.type : (opts.tag || "other");
  state.stats.dmgByType[tag] = (state.stats.dmgByType[tag] || 0) + dmg;
  if (hasRelic("vampiric")) state.coreHp = Math.min(state.coreMaxHp, state.coreHp + dmg * 0.01);
  e.hitFlash = 1;
  if (e.hp <= 0) {
    e.dead = true;
    state.energy += e.bounty;
    if (source) source.kills++;
    state.stats.kills++;
    meta.totalKills++;
    if (meta.totalKills >= 1000) unlockAchievement("kills");
    unlockAchievement("first");
    state.combo++;
    state.comboTimer = comboWindow();
    const mult = 1 + Math.min(4, Math.floor(state.combo / 5));
    if (mult >= 5) unlockAchievement("combo");
    addScore(e.score * mult);
    if (state.combo % 5 === 0) addText(e.x, e.y - 26, `¡COMBO x${mult}!`, "#ffc94a", 15);
    updateComboHUD();
    sfx.death();
    burst(e.x, e.y, e.elite ? "#ffc94a" : enemyColor(e), e.shape === "boss" ? 46 : 14, e.shape === "boss" ? 6 : 3);
    addText(e.x, e.y - 10, `+${e.bounty}`, "#ffe08a", 13);
    if (e.splits) spawnSplitChildren(e);
    // Esporas: las víctimas explotan
    if (source && source.evo === "spore" && !opts.noSpore) {
      const st = towerStats(source);
      const px = e.x, py = e.y, pd = st.dmg * 0.4;
      burst(px, py, "#52e5a5", 12, 4);
      forEnemiesNear(px, py, 50, (o) => {
        if (targetable(o) && dist2(o.x, o.y, px, py) < 50 * 50) {
          damageEnemy(o, pd, source, { noSpore: true });
        }
      });
    }
    if (Math.random() < ECON.gemDropChance) state.gems.push({ x: e.x, y: e.y, life: 6, seed: rand(0, TAU) });
    if (e.shape === "boss") {
      state.shake = 16;
      addScore(100);
      unlockAchievement(e.mega ? "mega" : "boss");
      chainExplosion(e.x, e.y, e.mega ? 10 : 6);
      setBossMusic(false);
    }
    updateHUD();
  }
}

function addScore(v) { state.score += Math.round(v * diff().score); }

function chainExplosion(x, y, n) {
  for (let i = 0; i < n; i++) {
    addTimer(i * 0.13, () => {
      const px = x + rand(-60, 60), py = y + rand(-60, 60);
      burst(px, py, pick(["#ff5470", "#ffc94a", "#b06df0"]), 16, 5);
      state.shockwaves.push({ x: px, y: py, r: 4, max: rand(40, 80), life: 0.5, color: "rgba(255,120,90,1)" });
      sfx.hit();
    });
  }
}

// ---------- Habilidades ----------
function abilityUnlocked(a) { return state.wave >= a.unlock; }

function useAbility(id) {
  if (!state.running || state.gameOver || state.paused || state.drafting) return;
  const a = D.ABILITIES.find(x => x.id === id);
  if (!a || !abilityUnlocked(a) || state.cooldowns[id] > 0) { sfx.error(); return; }
  state.cooldowns[id] = a.cd * metaCdrMult() * relicCdMult();
  if (id === "pulse") {
    firePulse();
    if (hasRelic("echo")) addTimer(0.35, firePulse);
  }
  else if (id === "storm") fireStorm();
  else if (id === "shield") fireShield();
  else if (id === "over") fireOverdrive();
  refreshAbilityBar();
}

function firePulse() {
  state.shockwaves.push({ x: CX, y: CY, r: 34, max: 300, life: 1 });
  sfx.pulse();
  state.shake = 10;
  const R = 300;
  forEnemiesNear(CX, CY, R, (e) => {
    if (e.burrowed || e.dead) return;
    const d2 = dist2(e.x, e.y, CX, CY);
    if (d2 < R * R) {
      damageEnemy(e, 35, null, { tag: "abilities" });
      const d = Math.sqrt(d2) || 1;
      const k = 170 * (1 - d / R) + 60;
      e.x += ((e.x - CX) / d) * k;
      e.y += ((e.y - CY) / d) * k;
    }
  });
}

function fireStorm() {
  sfx.meteor();
  for (let i = 0; i < 12; i++) {
    addTimer(i * 0.16, () => {
      let x, y;
      const alive = state.enemies.filter(e => !e.dead && !e.burrowed);
      if (alive.length && Math.random() < 0.8) {
        const e = pick(alive);
        x = e.x + rand(-70, 70); y = e.y + rand(-70, 70);
      } else {
        x = rand(60, W - 60); y = rand(60, H - 60);
      }
      for (let j = 0; j < 7; j++) {
        emit(x + j * 6 + rand(-3, 3), y - j * 26, rand(-20, 20), rand(80, 160), rand(0.2, 0.4), rand(1.5, 3.5), "#ffb36b");
      }
      burst(x, y, "#ffb36b", 20, 5);
      state.shockwaves.push({ x, y, r: 6, max: 80, life: 0.6, color: "rgba(255,179,107,1)" });
      sfx.meteor();
      state.shake = Math.max(state.shake, 5);
      forEnemiesNear(x, y, 78, (e) => {
        if (!e.dead && !e.burrowed && dist2(e.x, e.y, x, y) < 78 * 78) damageEnemy(e, 45, null, { tag: "abilities" });
      });
    });
  }
}

function fireShield() {
  state.shieldUntil = state.time + 4;
  sfx.shield();
  state.shockwaves.push({ x: CX, y: CY, r: 34, max: 78, life: 0.8, color: "rgba(110,231,216,1)" });
}

function fireOverdrive() {
  state.overUntil = state.time + 6;
  sfx.over();
  addText(CX, CY - 64, t("overdrive"), "#ff9a3c", 18);
  for (const tw of state.towers) burst(tw.x, tw.y, "#ff9a3c", 6, 2);
}

// ---------- Reliquias (draft) ----------
function openDraft() {
  const available = Object.keys(D.RELICS).filter(id => !hasRelic(id));
  if (!available.length) return;
  // Selección determinista con la semilla de la partida
  const rng = D.mulberry32(hash2(state.seed, state.wave * 131 + 5));
  const picks = [];
  const poolCopy = available.slice();
  while (picks.length < 3 && poolCopy.length) {
    picks.push(poolCopy.splice(Math.floor(rng() * poolCopy.length), 1)[0]);
  }
  state.drafting = true;
  const cards = document.getElementById("draft-cards");
  cards.innerHTML = "";
  for (const id of picks) {
    const r = D.RELICS[id];
    const card = document.createElement("div");
    card.className = "draft-card";
    card.innerHTML = `<div class="d-icon">${r.icon}</div><div class="d-name">${tn(r.name)}</div><div class="d-desc">${tn(r.desc)}</div>`;
    card.addEventListener("click", () => {
      applyRelic(id);
      state.drafting = false;
      document.getElementById("draft").classList.add("hidden");
      saveGame();
    });
    cards.appendChild(card);
  }
  document.getElementById("draft").classList.remove("hidden");
}

function applyRelic(id) {
  state.relics.push(id);
  const r = D.RELICS[id];
  sfx.relic();
  showToast(r.icon, tn(r.name), tn(r.desc));
  if (id === "bastion") {
    state.coreMaxHp += 20;
    state.coreHp = Math.min(state.coreMaxHp, state.coreHp + 20);
  }
  updateHUD();
}

// ---------- Gemas ----------
function updateGems(dt) {
  const R = gemRadius();
  for (const g of state.gems) {
    g.life -= dt;
    const d2m = dist2(g.x, g.y, state.mouseX, state.mouseY);
    // El imán atrae las gemas hacia el cursor
    if (hasRelic("magnet") && d2m < 180 * 180 && d2m > 30 * 30) {
      const d = Math.sqrt(d2m);
      g.x += ((state.mouseX - g.x) / d) * 220 * dt;
      g.y += ((state.mouseY - g.y) / d) * 220 * dt;
    }
    if (d2m < R * R) {
      g.dead = true;
      state.energy += gemValue();
      state.stats.gems++;
      if (state.stats.gems >= 20) unlockAchievement("gems");
      sfx.coin();
      addText(g.x, g.y - 10, `+${gemValue()} 💎`, "#6ee7d8", 12);
      updateHUD();
    }
  }
  state.gems = state.gems.filter(g => !g.dead && g.life > 0);
}

// ---------- Guardado de partida ----------
function saveGame() {
  const data = {
    v: 3,
    seed: state.seed,
    daily: state.daily,
    wave: state.wave,
    energy: state.energy,
    score: state.score,
    coreHp: state.coreHp,
    coreMaxHp: state.coreMaxHp,
    difficulty: state.difficulty,
    endless: state.endless,
    relics: state.relics,
    waveLog: state.waveLog,
    stats: state.stats,
    towers: state.towers.map(tw => ({
      type: tw.type, dx: tw.x - CX, dy: tw.y - CY,
      level: tw.level, kills: tw.kills, invested: tw.invested,
      priority: tw.priority, evo: tw.evo,
    })),
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* sin espacio */ }
}
function deleteSave() { localStorage.removeItem(SAVE_KEY); }
function getSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d && d.v === 3 ? d : null;
  } catch (e) { return null; }
}

function loadGame() {
  const d = getSave();
  if (!d) return false;
  resetGame(d.difficulty, { seed: d.seed, daily: d.daily, skipTutorial: true });
  state.wave = d.wave;
  state.energy = d.energy;
  state.score = d.score;
  state.coreMaxHp = d.coreMaxHp;
  state.coreHp = d.coreHp;
  state.endless = !!d.endless;
  state.relics = d.relics || [];
  state.waveLog = d.waveLog || [];
  state.stats = { ...freshStats(), ...(d.stats || {}) };
  state.stats.dmgByType = (d.stats && d.stats.dmgByType) || {};
  state.towers = (d.towers || []).map(tw => {
    const x = clamp(CX + tw.dx, 20, W - 20);
    const y = clamp(CY + tw.dy, 20, H - 20);
    return {
      type: tw.type, x, y,
      level: tw.level, kills: tw.kills || 0, invested: tw.invested,
      priority: tw.priority || "core", evo: tw.evo || null,
      cooldown: 0, angle: rand(0, TAU), flash: 0, buildAnim: 1,
      stunUntil: 0, beamTarget: null, beamTime: 0,
      empowered: !!spotAt(x, y),
    };
  });
  state.autoStartTimer = 25;
  showBanner(`${t("waveN").toUpperCase()} ${state.wave} ✓`, t("recovered"));
  showWavePreview();
  refreshToolbar();
  refreshAbilityBar();
  updateHUD();
  return true;
}

// ---------- Tutorial ----------
function setTutStep(n) {
  state.tutStep = n;
  const box = document.getElementById("tutorial");
  if (!n || n > 4) { box.style.display = "none"; return; }
  box.innerHTML = `${t("tut" + n)}<br><span class="tut-skip" id="tut-skip">${t("tutSkip")}</span>`;
  box.style.display = "block";
  document.getElementById("tut-skip").addEventListener("click", () => {
    meta.tutorialDone = true;
    metaSave();
    setTutStep(0);
  });
}
function finishTutorial() {
  meta.tutorialDone = true;
  metaSave();
  setTutStep(0);
  showToast("🎓", t("tutDone"), "");
}

// ---------- Bucle principal ----------
let lastTime = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  if (dt > 0) fpsEma = fpsEma * 0.95 + (1 / dt) * 0.05;
  if (!meta.settings.reduced) updateFireflies(dt);
  if (state.running && !state.gameOver && !state.paused && !state.drafting) update(dt);
  render();
  requestAnimationFrame(frame);
}

function updateFireflies(dt) {
  for (const f of fireflies) {
    f.x += Math.cos(f.seed + performance.now() / 3000) * f.speed * dt;
    f.y += Math.sin(f.seed * 1.7 + performance.now() / 2600) * f.speed * dt;
    if (f.x < -10) f.x = W + 10; if (f.x > W + 10) f.x = -10;
    if (f.y < -10) f.y = H + 10; if (f.y > H + 10) f.y = -10;
  }
}

function update(dt) {
  state.time += dt;
  if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 40);
  if (state.corePulse > 0) state.corePulse -= dt * 2;

  rebuildGrid();

  if (state.timers.length) {
    const due = state.timers.filter(x => x.t <= state.time);
    state.timers = state.timers.filter(x => x.t > state.time);
    for (const x of due) x.fn();
  }

  let cdChanged = false;
  for (const a of D.ABILITIES) {
    if (state.cooldowns[a.id] > 0) {
      state.cooldowns[a.id] = Math.max(0, state.cooldowns[a.id] - dt);
      cdChanged = true;
    }
  }
  if (cdChanged) refreshAbilityBar();

  if (state.comboTimer > 0) {
    state.comboTimer -= dt;
    if (state.comboTimer <= 0) { state.combo = 0; updateComboHUD(); }
  }

  if (state.phase === "build" && state.wave > 0) {
    state.autoStartTimer -= dt;
    nextWaveBtn.textContent = `${t("nextWave")} (${Math.ceil(Math.max(0, state.autoStartTimer))}s)`;
    if (state.autoStartTimer <= 0) startWave(false);
  }

  if (state.phase === "wave" && state.spawnQueue.length > 0) {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnEnemy(state.spawnQueue.pop());
      const base = Math.max(0.18, 1.1 - state.wave * 0.05);
      state.spawnTimer = base * (0.7 + state.waveRng() * 0.6);
    }
  }

  const shieldActive = state.time < state.shieldUntil;
  const overActive = state.time < state.overUntil;
  const mutRegen = state.mutator && state.mutator.regen;

  // ----- Enemigos -----
  for (const e of state.enemies) {
    if (e.dead) continue;
    if (e.hitFlash > 0) e.hitFlash -= dt * 6;
    if (e.spawnAnim < 1) {
      e.spawnAnim = Math.min(1, e.spawnAnim + dt * 1.8);
      if (e.spawnAnim < 0.35) continue;
    }
    if (e.shape === "ghost") e.phased = Math.sin(state.time * 1.6 + e.wobbleSeed) > 0.15;

    // Quemadura / regeneraciones
    if (state.time < e.burnUntil && e.burnDps > 0) damageEnemy(e, e.burnDps * dt, e.burnSrc);
    if (e.dead) continue;
    if (mutRegen && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * state.mutator.regen * dt);
    if (e.affix === "regen" && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.03 * dt);

    const dx = CX - e.x, dy = CY - e.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;

    if (e.type === "digger") {
      if (!e.burrowed && !e.emerged && d < e.burrowAt) {
        e.burrowed = true;
        burst(e.x, e.y, "#d8a05c", 10, 3);
      }
      if (e.burrowed && d < 230) {
        e.burrowed = false;
        e.emerged = true;
        burst(e.x, e.y, "#d8a05c", 18, 4);
        state.shockwaves.push({ x: e.x, y: e.y, r: 4, max: 50, life: 0.5, color: "rgba(216,160,92,1)" });
      }
    }

    if (e.type === "healer" && state.time > e.nextHeal) {
      e.nextHeal = state.time + 0.5;
      forEnemiesNear(e.x, e.y, 90, (o) => {
        if (o !== e && !o.dead && o.hp < o.maxHp && dist2(e.x, e.y, o.x, o.y) < 90 * 90) {
          o.hp = Math.min(o.maxHp, o.hp + 5);
          emit(o.x + rand(-8, 8), o.y + rand(-4, 4), 0, -30, 0.5, 2, "#7dffa8");
        }
      });
    }

    // Comportamientos de jefe
    if (e.shape === "boss") {
      if (state.time > e.nextPulse) {
        e.nextPulse = state.time + 6;
        state.shockwaves.push({ x: e.x, y: e.y, r: 10, max: 170, life: 0.8, color: "rgba(120,40,120,1)" });
        sfx.stun();
        let stunned = 0;
        for (const tw of state.towers) {
          if (dist2(tw.x, tw.y, e.x, e.y) < 170 * 170 && !synergyFor(tw).stunImmune) {
            tw.stunUntil = state.time + 1.6;
            stunned++;
          }
        }
        if (stunned) addText(e.x, e.y - e.radius - 16, t("towersStunned"), "#c084fc", 13);
      }
      if (e.mega && state.time > e.nextSummon) {
        e.nextSummon = state.time + 7;
        for (let i = 0; i < 3; i++) spawnEnemyAt("mote", e.x + rand(-30, 30), e.y + rand(-30, 30));
        addText(e.x, e.y - e.radius - 16, t("summons"), "#ff8ac2", 13);
      }
      if (e.bossKind === "weaver" && state.time > e.nextWeave) {
        e.nextWeave = state.time + 5;
        for (let i = 0; i < 2; i++) spawnEnemyAt("mote", e.x + rand(-26, 26), e.y + rand(-26, 26));
        addText(e.x, e.y - e.radius - 16, t("summons"), "#ff8ac2", 13);
      }
      if (e.bossKind === "colossus" && state.time > e.nextShield) {
        e.nextShield = state.time + 7;
        e.shieldHits = 6;
        state.shockwaves.push({ x: e.x, y: e.y, r: e.radius, max: e.radius + 26, life: 0.6, color: "rgba(143,212,255,1)" });
      }
      if (e.bossKind === "devourer" && !e.enraged && e.hp < e.maxHp * 0.5) {
        e.enraged = true;
        e.speed *= 1.6;
        addText(e.x, e.y - e.radius - 16, t("enraged"), "#ff5470", 15);
        burst(e.x, e.y, "#ff5470", 20, 5);
      }
    }

    // Movimiento (con estasis y desvío alrededor de las rocas)
    if (state.time < e.stasisUntil) continue;
    const slowed = state.time < e.slowUntil && !e.slowImmune ? e.slowFactor : 1;
    const wob = Math.sin(state.time * 3 + e.wobbleSeed) * 0.35;
    const ang = Math.atan2(dy, dx) + wob * (e.type === "swift" ? 1.4 : 0.6);
    const v = e.speed * slowed * (e.burrowed ? 2.2 : 1);
    let vx = Math.cos(ang) * v, vy = Math.sin(ang) * v;
    if (!e.burrowed) {
      for (const rock of state.rocks) {
        const rd2 = dist2(e.x, e.y, rock.x, rock.y);
        const lim = rock.r + e.radius + 6;
        const influence = lim + 42;
        if (rd2 < influence * influence) {
          const rd = Math.sqrt(rd2) || 1;
          const push = Math.max(0, (influence - rd) / 42) * v * 1.5;
          vx += ((e.x - rock.x) / rd) * push;
          vy += ((e.y - rock.y) / rd) * push;
          if (rd < lim) { // resolución dura: nunca dentro de la roca
            e.x = rock.x + ((e.x - rock.x) / rd) * lim;
            e.y = rock.y + ((e.y - rock.y) / rd) * lim;
          }
        }
      }
    }
    e.x += vx * dt;
    e.y += vy * dt;

    if (d < 34 + e.radius) {
      if (shieldActive) {
        const k = 180;
        e.x += ((e.x - CX) / d) * k;
        e.y += ((e.y - CY) / d) * k;
        damageEnemy(e, 25, null, { tag: "abilities" });
        burst(e.x, e.y, "#6ee7d8", 8, 3);
      } else {
        e.dead = true;
        state.coreHp -= e.dmg;
        state.waveDamageTaken += e.dmg;
        state.corePulse = 1;
        state.shake = Math.max(state.shake, 8);
        sfx.coreHit();
        burst(e.x, e.y, "#ff5470", 18, 4);
        addText(CX, CY - 46, `-${e.dmg}`, "#ff5470", 16);
        updateHUD();
        if (state.coreHp <= 0) { gameOver(); return; }
      }
    }
  }
  state.enemies = state.enemies.filter(e => !e.dead);

  // ----- Torres -----
  for (const tw of state.towers) {
    if (tw.flash > 0) tw.flash -= dt * 3;
    if (tw.buildAnim < 1) tw.buildAnim = Math.min(1, tw.buildAnim + dt * 2.5);
    const stunned = state.time < tw.stunUntil;
    const def = D.TOWER_TYPES[tw.type];
    const st = towerStats(tw);

    // Vórtice: aura de ralentización continua
    if (tw.evo === "vortex" && !stunned) {
      forEnemiesNear(tw.x, tw.y, st.range, (e) => {
        if (e.dead || e.slowImmune || e.burrowed) return;
        if (dist2(tw.x, tw.y, e.x, e.y) > st.range * st.range) return;
        if (state.time > e.slowUntil || e.slowFactor > 0.7) {
          e.slowUntil = state.time + 0.15;
          e.slowFactor = 0.7;
        }
      });
    }

    if (def.beam) {
      let target = tw.beamTarget;
      if (!target || target.dead || !targetable(target) || dist2(tw.x, tw.y, target.x, target.y) > st.range * st.range) {
        target = pickTarget(tw, st.range);
        tw.beamTime = 0;
      }
      tw.beamTarget = stunned ? null : target;
      tw.prismHits = null;
      if (tw.beamTarget) {
        tw.angle = Math.atan2(tw.beamTarget.y - tw.y, tw.beamTarget.x - tw.x);
        tw.beamTime += dt;
        const rampCap = tw.evo === "focus" ? 3 : 1.5;
        const ramp = 1 + Math.min(rampCap, tw.beamTime * 0.5);
        const over = overActive ? 1.6 : 1;
        damageEnemy(tw.beamTarget, st.dmg * ramp * over * dt, tw);
        // Prisma: refracción a objetivos secundarios
        if (tw.evo === "prism" && tw.beamTarget && !tw.beamTarget.dead) {
          const prim = tw.beamTarget;
          const hits = [];
          forEnemiesNear(prim.x, prim.y, 130, (o) => {
            if (hits.length >= 2 || o === prim || !targetable(o)) return;
            if (dist2(o.x, o.y, prim.x, prim.y) < 130 * 130) {
              damageEnemy(o, st.dmg * ramp * over * 0.5 * dt, tw);
              hits.push(o);
            }
          });
          tw.prismHits = hits;
        }
      }
      continue;
    }

    tw.cooldown -= dt * (overActive ? 2 : 1);
    if (stunned) continue;
    if (tw.cooldown > 0) {
      const tgt = pickTarget(tw, st.range);
      if (tgt) tw.angle = Math.atan2(tgt.y - tw.y, tgt.x - tw.x);
      continue;
    }
    const targets = pickTargets(tw, st.range, tw.evo === "twin" ? 2 : 1);
    if (!targets.length) continue;
    tw.angle = Math.atan2(targets[0].y - tw.y, targets[0].x - tw.x);
    tw.cooldown = st.rate;

    if (def.chain) {
      // Rayo encadenado (Amatista)
      const isSuper = tw.evo === "super";
      const maxChain = isSuper ? 7 : def.chain;
      const falloff = isSuper ? 1 : 0.72;
      const pts = [{ x: tw.x, y: tw.y }];
      const hitSet = new Set();
      let current = targets[0];
      let dmg = st.dmg;
      for (let i = 0; i < maxChain && current; i++) {
        pts.push({ x: current.x, y: current.y });
        hitSet.add(current);
        rollHit(current, dmg, tw, { syn: st.syn });
        if (tw.evo === "static" && !current.dead && Math.random() < 0.25) {
          current.stasisUntil = state.time + 0.4;
          addText(current.x, current.y - current.radius - 10, "💫", "#c084fc", 11);
        }
        dmg *= falloff;
        let next = null, bd = def.chainRange * def.chainRange;
        const cur = current;
        forEnemiesNear(cur.x, cur.y, def.chainRange, (e) => {
          if (!targetable(e) || hitSet.has(e)) return;
          const d2c = dist2(cur.x, cur.y, e.x, e.y);
          if (d2c < bd) { bd = d2c; next = e; }
        });
        current = next;
      }
      state.beams.push({ pts, color: def.color, life: 0.18, maxLife: 0.18 });
      sfx.zap();
    } else if (def.pierce) {
      // Disparo perforante (Ámbar)
      for (const target of targets) {
        const dd = Math.sqrt(dist2(tw.x, tw.y, target.x, target.y)) || 1;
        state.projectiles.push({
          kind: "line",
          x: tw.x, y: tw.y,
          vx: ((target.x - tw.x) / dd) * def.projSpeed,
          vy: ((target.y - tw.y) / dd) * def.projSpeed,
          dmg: st.dmg, color: def.color, source: tw, syn: st.syn,
          pierce: tw.evo === "ballista" ? 999 : def.pierce,
          hitSet: new Set(), trail: [],
        });
      }
      sfx.shoot();
    } else {
      for (const target of targets) {
        state.projectiles.push({
          kind: "homing",
          x: tw.x, y: tw.y, target,
          speed: def.projSpeed, dmg: st.dmg, color: def.color, source: tw, syn: st.syn,
          splash: def.splash ? def.splash * (tw.evo === "nova" ? 1.5 : 1) : 0,
          slowFactor: def.slowFactor || 0, slowTime: def.slowTime || 0,
          trail: [],
        });
      }
      sfx.shoot();
    }
  }

  // ----- Proyectiles -----
  for (const p of state.projectiles) {
    if (p.kind === "line") {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 6) p.trail.shift();
      if (p.x < -30 || p.y < -30 || p.x > W + 30 || p.y > H + 30) { p.dead = true; continue; }
      forEnemiesNear(p.x, p.y, 40, (e) => {
        if (p.dead || !targetable(e) || p.hitSet.has(e)) return;
        if (dist2(e.x, e.y, p.x, p.y) < (e.radius + 6) * (e.radius + 6)) {
          p.hitSet.add(e);
          rollHit(e, p.dmg, p.source, { syn: p.syn });
          burst(p.x, p.y, p.color, 5, 2);
          sfx.hit();
          p.pierce--;
          if (p.pierce <= 0) p.dead = true;
        }
      });
      continue;
    }
    const tgt = p.target;
    if (!tgt || tgt.dead) {
      if (p.vx === undefined) { p.dead = true; continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.x < -20 || p.y < -20 || p.x > W + 20 || p.y > H + 20) p.dead = true;
      continue;
    }
    const dx = tgt.x - p.x, dy = tgt.y - p.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    p.vx = (dx / d) * p.speed;
    p.vy = (dy / d) * p.speed;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.trail.push({ x: p.x, y: p.y });
    if (p.trail.length > 6) p.trail.shift();

    if (d < tgt.radius + 6 && !tgt.phased && !tgt.burrowed) {
      p.dead = true;
      sfx.hit();
      if (p.splash) {
        burst(p.x, p.y, p.color, 16, 4);
        state.shockwaves.push({ x: p.x, y: p.y, r: 4, max: p.splash, life: 0.5, color: p.color });
        forEnemiesNear(p.x, p.y, p.splash, (e) => {
          if (targetable(e) && dist2(e.x, e.y, p.x, p.y) < p.splash * p.splash) {
            rollHit(e, p.dmg, p.source, { syn: p.syn });
          }
        });
      } else {
        burst(p.x, p.y, p.color, 5, 2);
        rollHit(tgt, p.dmg, p.source, { syn: p.syn });
      }
      if (p.slowFactor && !tgt.dead && !tgt.slowImmune) {
        // Cero Absoluto: probabilidad de congelación total
        if (p.source && p.source.evo === "zero" && Math.random() < 0.25) {
          tgt.slowUntil = state.time + 0.5;
          tgt.slowFactor = 0.05;
          sfx.freeze();
          addText(tgt.x, tgt.y - tgt.radius - 10, "❄", "#bfe9ff", 12);
        } else {
          tgt.slowUntil = state.time + p.slowTime;
          tgt.slowFactor = p.slowFactor;
        }
      }
    }
  }
  state.projectiles = state.projectiles.filter(p => !p.dead);

  updateGems(dt);
  updateParticles(dt);

  for (const tx of state.texts) { tx.life -= dt; tx.y -= 26 * dt; }
  state.texts = state.texts.filter(x => x.life > 0);

  for (const sw of state.shockwaves) {
    sw.life -= dt * 1.6;
    sw.r = lerp(sw.r, sw.max, dt * 7);
  }
  state.shockwaves = state.shockwaves.filter(s => s.life > 0);

  for (const bm of state.beams) bm.life -= dt;
  state.beams = state.beams.filter(b => b.life > 0);

  if (state.phase === "wave") {
    const remaining = state.spawnQueue.length + state.enemies.length;
    const frac = state.waveTotal > 0 ? clamp(remaining / state.waveTotal, 0, 1) : 0;
    waveProgressBar.style.width = `${frac * 100}%`;
    waveProgressLabel.textContent = t("shadowsLeft", remaining);
    if (state.spawnQueue.length === 0 && state.enemies.length === 0) endWave();
  }
}

// ---------- Final de partida ----------
function buildStatsHTML() {
  const s = state.stats;
  const items = [
    [state.wave, t("statWaves")], [state.score, t("statScore")],
    [s.kills, t("statKills")], [Math.round(s.dmgDealt), t("statDmg")],
    [s.towersBuilt, t("statTowers")], [s.crits, t("statCrits")],
    [s.gems, t("statGems")], [s.perfectWaves, t("statPerfect")],
  ];
  return items.map(([n, l]) => `<div class="sg"><div class="n">${n}</div><div class="l">${l}</div></div>`).join("");
}

function drawRunChart(canvasEl) {
  const c = canvasEl.getContext("2d");
  const cw = canvasEl.width, ch = canvasEl.height;
  c.clearRect(0, 0, cw, ch);
  const log = state.waveLog;
  if (!log.length) return;
  const maxDealt = Math.max(1, ...log.map(x => x.dealt));
  const maxTaken = Math.max(1, ...log.map(x => x.taken));
  const pad = 6, bw = (cw - pad * 2) / log.length;
  // Barras: daño recibido
  for (let i = 0; i < log.length; i++) {
    const h = (log[i].taken / maxTaken) * (ch - 26);
    c.fillStyle = "rgba(255,84,112,0.55)";
    c.fillRect(pad + i * bw + 1, ch - 14 - h, Math.max(2, bw - 2), h);
  }
  // Línea: daño infligido
  c.strokeStyle = "#8c78ff";
  c.lineWidth = 2;
  c.beginPath();
  for (let i = 0; i < log.length; i++) {
    const x = pad + i * bw + bw / 2;
    const y = ch - 14 - (log[i].dealt / maxDealt) * (ch - 26);
    if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
  }
  c.stroke();
  // Etiquetas de oleada cada 5
  c.fillStyle = "#9a92c9";
  c.font = "9px sans-serif";
  c.textAlign = "center";
  for (let i = 0; i < log.length; i++) {
    if (log[i].w % 5 === 0 || i === 0) c.fillText(log[i].w, pad + i * bw + bw / 2, ch - 3);
  }
}

function buildDmgBars(container) {
  const byType = state.stats.dmgByType;
  const entries = Object.entries(byType).filter(([, v]) => v > 0.5).sort((a, b) => b[1] - a[1]).slice(0, 7);
  if (!entries.length) { container.innerHTML = ""; return; }
  const max = entries[0][1];
  const colorOf = (k) => D.TOWER_TYPES[k] ? D.TOWER_TYPES[k].color : "#ffc94a";
  const nameOf = (k) => D.TOWER_TYPES[k] ? tn(D.TOWER_TYPES[k].name) : (k === "abilities" ? "⚡" : k);
  container.innerHTML = `<div class="db-row" style="justify-content:center; color:var(--dim); font-size:10.5px; text-transform:uppercase; letter-spacing:1px;">${t("dmgByTower")}</div>` +
    entries.map(([k, v]) =>
      `<div class="db-row"><span class="db-name">${nameOf(k)}</span>` +
      `<div class="db-track"><div class="db-fill" style="width:${(v / max) * 100}%; background:${colorOf(k)};"></div></div>` +
      `<span class="db-val">${Math.round(v)}</span></div>`
    ).join("");
}

function finishRun(win) {
  const earned = ECON.fragmentsEarned(state.wave, state.score);
  meta.fragments += earned;
  if (state.score > meta.best) meta.best = state.score;
  meta.history.unshift({
    d: Date.now(), wave: state.wave, score: state.score,
    diff: state.difficulty, win: !!win, daily: state.daily,
  });
  meta.history = meta.history.slice(0, 8);
  if (state.daily) {
    const today = new Date().toISOString().slice(0, 10);
    if (!meta.daily || meta.daily.date !== today || state.score > meta.daily.best) {
      meta.daily = { date: today, best: Math.max(state.score, (meta.daily && meta.daily.date === today) ? meta.daily.best : 0) };
    }
    showToast("📅", t("dailyDone", state.score), "");
  }
  metaSave();
  deleteSave();
  return earned;
}

function gameOver() {
  state.gameOver = true;
  state.shake = 24;
  sfx.coreHit();
  setBossMusic(false);
  burst(CX, CY, "#8c78ff", 80, 8);
  burst(CX, CY, "#ff5470", 60, 6);
  const earned = finishRun(false);
  setTimeout(() => {
    document.getElementById("final-stats").innerHTML = buildStatsHTML();
    document.getElementById("final-frags").textContent = `${t("fragsEarned", earned)} · ${t("best")}: ${meta.best}`;
    document.getElementById("go-chart-title").textContent = `${t("chartTitle")} — ▂ ${t("chartTaken")} · ─ ${t("chartDealt")}`;
    drawRunChart(document.getElementById("go-chart"));
    buildDmgBars(document.getElementById("go-bars"));
    document.getElementById("gameover").classList.remove("hidden");
    nextWaveBtn.style.display = "none";
    wavePreview.style.display = "none";
    waveProgressWrap.style.display = "none";
  }, 900);
}

function victory() {
  state.running = false;
  unlockAchievement("legend");
  const earned = finishRun(true);
  nextWaveBtn.style.display = "none";
  wavePreview.style.display = "none";
  waveProgressWrap.style.display = "none";
  document.getElementById("victory-stats").innerHTML = buildStatsHTML();
  document.getElementById("victory-frags").textContent = t("fragsEarned", earned);
  document.getElementById("vic-chart-title").textContent = `${t("chartTitle")} — ▂ ${t("chartTaken")} · ─ ${t("chartDealt")}`;
  drawRunChart(document.getElementById("vic-chart"));
  buildDmgBars(document.getElementById("vic-bars"));
  document.getElementById("victory").classList.remove("hidden");
  sfx.achieve();
  burst(CX, CY, "#ffc94a", 80, 8);
}

// ---------- Render ----------
function enemyColor(e) {
  return meta.settings.cb ? (D.ENEMY_COLORS_CB[e.type] || e.color) : e.color;
}

function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  if (state.shake > 0.5 && meta.settings.shake) {
    ctx.translate(rand(-state.shake, state.shake) * 0.4, rand(-state.shake, state.shake) * 0.4);
  }
  if (backdrop) ctx.drawImage(backdrop, 0, 0, W, H);
  else { ctx.fillStyle = "#0b0a14"; ctx.fillRect(0, 0, W, H); }

  if (state.wave > 0) {
    ctx.fillStyle = `hsla(${(250 + state.wave * 7) % 360}, 60%, 22%, 0.07)`;
    ctx.fillRect(0, 0, W, H);
  }

  if (!meta.settings.reduced) {
    for (const f of fireflies) {
      const tw = 0.3 + Math.abs(Math.sin(performance.now() / 900 + f.seed)) * 0.6;
      ctx.globalAlpha = tw * 0.55;
      ctx.fillStyle = `hsl(${f.hue}, 80%, 70%)`;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.size, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawSpots();
  drawCore();
  for (const tw of state.towers) drawTower(tw);
  drawPlacementPreview();
  for (const e of state.enemies) drawEnemy(e);
  for (const g of state.gems) drawGem(g);
  for (const bm of state.beams) drawChainBeam(bm);
  drawDiamondBeams();
  for (const p of state.projectiles) drawProjectile(p);
  for (const sw of state.shockwaves) drawShockwave(sw);
  for (const pt of state.particles) drawParticle(pt);
  for (const tx of state.texts) drawText(tx);
  drawVignette();

  ctx.restore();
}

function drawSpots() {
  for (const s of state.spots) {
    const pulse = 0.5 + Math.sin(state.time * 2 + s.seed) * 0.2;
    ctx.strokeStyle = `rgba(255,201,74,${0.25 * pulse + 0.12})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 6]);
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, state.time * 0.4 + s.seed, state.time * 0.4 + s.seed + TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = `rgba(255,201,74,${0.05 + 0.04 * pulse})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = `rgba(255,201,74,${0.5 + 0.3 * pulse})`;
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("⛰", s.x, s.y + 4);
  }
}

function drawCore() {
  const pulse = 1 + Math.sin(state.time * 2.2) * 0.05 + state.corePulse * 0.18;
  const r = 34 * pulse;
  const hpFrac = clamp(state.coreHp / state.coreMaxHp, 0, 1);

  const halo = ctx.createRadialGradient(CX, CY, r * 0.4, CX, CY, r * 3.4);
  halo.addColorStop(0, `hsla(${255 - hpFrac * 60}, 80%, 65%, ${0.28 + state.corePulse * 0.3})`);
  halo.addColorStop(1, "transparent");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(CX, CY, r * 3.4, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = "rgba(140,120,255,0.10)";
  ctx.setLineDash([6, 10]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(CX, CY, 78, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);

  const facets = 7;
  for (let layer = 0; layer < 2; layer++) {
    const rr = r * (layer === 0 ? 1 : 0.62);
    ctx.beginPath();
    for (let i = 0; i <= facets; i++) {
      const a = (i / facets) * TAU + state.time * (layer === 0 ? 0.25 : -0.4);
      const jag = 1 + Math.sin(i * 3.7) * 0.12;
      ctx[i === 0 ? "moveTo" : "lineTo"](CX + Math.cos(a) * rr * jag, CY + Math.sin(a) * rr * jag);
    }
    ctx.closePath();
    const g = ctx.createLinearGradient(CX - r, CY - r, CX + r, CY + r);
    if (layer === 0) {
      g.addColorStop(0, `hsla(${190 + hpFrac * 40}, 85%, ${45 + hpFrac * 15}%, 0.95)`);
      g.addColorStop(1, "hsla(265, 80%, 55%, 0.95)");
    } else {
      g.addColorStop(0, "rgba(255,255,255,0.85)");
      g.addColorStop(1, "rgba(200,230,255,0.35)");
    }
    ctx.fillStyle = g;
    ctx.fill();
  }

  if (hpFrac < 0.9) {
    ctx.strokeStyle = `rgba(10,8,20,${(1 - hpFrac) * 0.85})`;
    ctx.lineWidth = 1.6;
    const visible = Math.ceil((1 - hpFrac) * crackSegs.length);
    for (let i = 0; i < visible; i++) {
      const pts = crackSegs[i];
      ctx.beginPath();
      for (let j = 0; j < pts.length; j++) {
        ctx[j === 0 ? "moveTo" : "lineTo"](CX + pts[j][0] * r * 0.95, CY + pts[j][1] * r * 0.95);
      }
      ctx.stroke();
    }
  }

  if (state.time < state.shieldUntil) {
    ctx.strokeStyle = `rgba(110,231,216,${0.5 + Math.sin(state.time * 8) * 0.25})`;
    ctx.fillStyle = "rgba(110,231,216,0.07)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(CX, CY, 72 + Math.sin(state.time * 5) * 3, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
}

function drawTower(tw) {
  const def = D.TOWER_TYPES[tw.type];
  const st = towerStats(tw);
  const hover = state.hoverTower === tw;
  const scale = 0.3 + tw.buildAnim * 0.7;
  const stunned = state.time < tw.stunUntil;
  const overActive = state.time < state.overUntil;

  if (hover) {
    ctx.fillStyle = def.glow + "0.06)";
    ctx.strokeStyle = def.glow + "0.35)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(tw.x, tw.y, st.range, 0, TAU);
    ctx.fill();
    ctx.stroke();
    // Enlaces de sinergia
    for (const type of st.syn.list) {
      const o = state.towers.find(x => x.type === type && x !== tw && dist2(tw.x, tw.y, x.x, x.y) <= D.SYNERGY_RADIUS * D.SYNERGY_RADIUS);
      if (!o) continue;
      ctx.strokeStyle = D.TOWER_TYPES[type].glow + "0.5)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.moveTo(tw.x, tw.y);
      ctx.lineTo(o.x, o.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Aura del vórtice
  if (tw.evo === "vortex") {
    ctx.strokeStyle = `rgba(74,217,232,${0.12 + Math.sin(state.time * 3) * 0.05})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(tw.x, tw.y, st.range, 0, TAU);
    ctx.stroke();
  }

  ctx.fillStyle = stunned ? "rgba(60,30,70,0.9)" : "rgba(20,18,40,0.9)";
  ctx.strokeStyle = stunned ? "rgba(192,132,252,0.7)" : (tw.empowered ? "rgba(255,201,74,0.7)" : def.glow + "0.5)");
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(tw.x, tw.y, 16 * scale, 0, TAU);
  ctx.fill();
  ctx.stroke();

  ctx.save();
  ctx.translate(tw.x, tw.y);
  ctx.rotate(tw.angle);
  ctx.scale(scale, scale);
  const glow = 0.6 + tw.flash + (overActive ? 0.3 : 0);
  ctx.shadowColor = overActive ? "#ff9a3c" : def.color;
  ctx.shadowBlur = 10 + tw.flash * 20 + (overActive ? 8 : 0);
  ctx.fillStyle = def.color;
  ctx.globalAlpha = Math.min(1, glow);
  ctx.beginPath();
  ctx.moveTo(13, 0);
  ctx.lineTo(-4, -8);
  ctx.lineTo(-8, 0);
  ctx.lineTo(-4, 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  for (let i = 0; i < tw.level; i++) {
    const a = -TAU / 4 + (i - (tw.level - 1) / 2) * 0.45;
    ctx.fillStyle = "#ffe08a";
    ctx.beginPath();
    ctx.arc(tw.x + Math.cos(a) * 22, tw.y + Math.sin(a) * 22, 2.5, 0, TAU);
    ctx.fill();
  }
  if (tw.evo) {
    const evo = D.EVOLUTIONS[tw.type].find(e => e.id === tw.evo);
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(evo ? evo.icon : "✦", tw.x, tw.y - 26);
  }
  if (vetMult(tw) > 1.1) {
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("★", tw.x, tw.y + 28);
  }
}

function drawDiamondBeams() {
  for (const tw of state.towers) {
    if (!D.TOWER_TYPES[tw.type].beam || !tw.beamTarget || tw.beamTarget.dead) continue;
    const e = tw.beamTarget;
    const rampCap = tw.evo === "focus" ? 3 : 1.5;
    const ramp = Math.min(rampCap, tw.beamTime * 0.5);
    const w = 1.5 + ramp * 2;
    const grad = ctx.createLinearGradient(tw.x, tw.y, e.x, e.y);
    grad.addColorStop(0, "rgba(232,244,255,0.9)");
    grad.addColorStop(1, "rgba(160,220,255,0.55)");
    ctx.strokeStyle = grad;
    ctx.lineWidth = w + Math.sin(state.time * 30) * 0.8;
    ctx.shadowColor = "#bfe4ff";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(tw.x, tw.y);
    ctx.lineTo(e.x, e.y);
    ctx.stroke();
    // Refracciones del prisma
    if (tw.prismHits) {
      for (const o of tw.prismHits) {
        if (o.dead) continue;
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = "rgba(190,230,255,0.5)";
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(o.x, o.y);
        ctx.stroke();
      }
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(232,244,255,0.9)";
    ctx.beginPath();
    ctx.arc(e.x, e.y, 3 + ramp * 2, 0, TAU);
    ctx.fill();
  }
}

function drawChainBeam(bm) {
  ctx.globalAlpha = clamp(bm.life / bm.maxLife, 0, 1);
  ctx.strokeStyle = bm.color;
  ctx.shadowColor = bm.color;
  ctx.shadowBlur = 10;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let i = 0; i < bm.pts.length; i++) {
    const p = bm.pts[i];
    if (i === 0) ctx.moveTo(p.x, p.y);
    else {
      const prev = bm.pts[i - 1];
      ctx.lineTo((prev.x + p.x) / 2 + rand(-8, 8), (prev.y + p.y) / 2 + rand(-8, 8));
      ctx.lineTo(p.x, p.y);
    }
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}

function drawPlacementPreview() {
  if (!state.running || state.gameOver || state.hoverTower || state.drafting) return;
  if (state.mouseY > H - 130 && Math.abs(state.mouseX - W / 2) < 440) return;
  const def = D.TOWER_TYPES[state.selectedType];
  if (state.wave < def.unlockWave) return;
  const ok = canPlaceAt(state.mouseX, state.mouseY) && state.energy >= towerCost(state.selectedType);
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = ok ? def.color : "#ff5470";
  ctx.fillStyle = ok ? def.glow + "0.08)" : "rgba(255,84,112,0.08)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(state.mouseX, state.mouseY, def.range, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(state.mouseX, state.mouseY, 16, 0, TAU);
  ctx.stroke();
  // Vista previa de sinergias desde la posición del cursor
  if (ok) {
    const seen = new Set();
    for (const o of state.towers) {
      if (seen.has(o.type)) continue;
      if (dist2(state.mouseX, state.mouseY, o.x, o.y) <= D.SYNERGY_RADIUS * D.SYNERGY_RADIUS) {
        seen.add(o.type);
        ctx.strokeStyle = D.TOWER_TYPES[o.type].glow + "0.6)";
        ctx.setLineDash([4, 5]);
        ctx.beginPath();
        ctx.moveTo(state.mouseX, state.mouseY);
        ctx.lineTo(o.x, o.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    const sp = spotAt(state.mouseX, state.mouseY);
    if (sp) {
      ctx.fillStyle = "#ffc94a";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("+25%", state.mouseX, state.mouseY - 24);
    }
  }
  ctx.globalAlpha = 1;
}

function drawEnemy(e) {
  const flash = Math.max(0, e.hitFlash);
  const slowed = state.time < e.slowUntil && !e.slowImmune;
  const frozen = slowed && e.slowFactor <= 0.1;
  const color = enemyColor(e);
  ctx.save();
  ctx.translate(e.x, e.y);

  if (e.spawnAnim < 1) {
    ctx.strokeStyle = `rgba(140,120,255,${(1 - e.spawnAnim) * 0.8})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, e.radius + 10 + (1 - e.spawnAnim) * 14, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = e.spawnAnim;
    ctx.scale(e.spawnAnim, e.spawnAnim);
  }

  if (e.burrowed) {
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = "#5c4a32";
    ctx.beginPath();
    ctx.ellipse(0, 4, e.radius, e.radius * 0.4, 0, 0, TAU);
    ctx.fill();
    if (Math.random() < 0.3) {
      emit(e.x + rand(-8, 8), e.y + rand(-2, 6), rand(-15, 15), rand(-40, -10), 0.4, rand(1, 2.5), "#8a6f4d");
    }
    ctx.restore();
    return;
  }

  ctx.shadowColor = e.elite ? "#ffc94a" : color;
  ctx.shadowBlur = e.shape === "boss" ? 26 : e.elite ? 16 : 10;
  ctx.fillStyle = flash > 0.4 ? "#ffffff" : (frozen ? "#bfe9ff" : (e.enraged ? "#ff2f55" : color));

  const r = e.radius;
  const wob = Math.sin(state.time * 6 + e.wobbleSeed);

  if (e.shape === "tri") {
    ctx.rotate(Math.atan2(CY - e.y, CX - e.x));
    ctx.beginPath();
    ctx.moveTo(r * 1.3, 0);
    ctx.lineTo(-r, -r * 0.9);
    ctx.lineTo(-r * 0.5, 0);
    ctx.lineTo(-r, r * 0.9);
    ctx.closePath();
    ctx.fill();
  } else if (e.shape === "hex") {
    ctx.rotate(state.time * 0.8 + e.wobbleSeed);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      ctx[i === 0 ? "moveTo" : "lineTo"](Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  } else if (e.shape === "armored") {
    ctx.rotate(Math.atan2(CY - e.y, CX - e.x));
    ctx.beginPath();
    ctx.rect(-r * 0.9, -r * 0.8, r * 1.8, r * 1.6);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(230,238,255,0.6)";
    ctx.lineWidth = 1.5;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(i * r * 0.45, -r * 0.8);
      ctx.lineTo(i * r * 0.45, r * 0.8);
      ctx.stroke();
    }
  } else if (e.shape === "healer") {
    ctx.rotate(state.time * 0.6);
    ctx.beginPath();
    for (let i = 0; i <= 12; i++) {
      const a = (i / 12) * TAU;
      const rr = r * (1 + Math.sin(a * 4) * 0.12);
      ctx[i === 0 ? "moveTo" : "lineTo"](Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.rotate(-state.time * 0.6);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#0b3a22";
    ctx.fillRect(-r * 0.5, -r * 0.14, r, r * 0.28);
    ctx.fillRect(-r * 0.14, -r * 0.5, r * 0.28, r);
    ctx.strokeStyle = `rgba(125,255,168,${0.15 + Math.sin(state.time * 3) * 0.08})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 90, 0, TAU);
    ctx.stroke();
  } else if (e.shape === "digger") {
    ctx.rotate(Math.atan2(CY - e.y, CX - e.x));
    ctx.beginPath();
    ctx.moveTo(r * 1.2, 0);
    ctx.quadraticCurveTo(r * 0.3, -r, -r, -r * 0.6);
    ctx.lineTo(-r, r * 0.6);
    ctx.quadraticCurveTo(r * 0.3, r, r * 1.2, 0);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(50,35,20,0.7)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(r * 0.9, -r * 0.25);
    ctx.lineTo(r * 1.35, -r * 0.45);
    ctx.moveTo(r * 0.9, r * 0.25);
    ctx.lineTo(r * 1.35, r * 0.45);
    ctx.stroke();
  } else if (e.shape === "boss") {
    ctx.rotate(state.time * 0.5);
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      const rr = r * (i % 2 === 0 ? 1 : 0.65) * (1 + wob * 0.05);
      ctx[i === 0 ? "moveTo" : "lineTo"](Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.rotate(-state.time * 0.5);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.28, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#0b0a14";
    const ea = Math.atan2(CY - e.y, CX - e.x);
    ctx.beginPath();
    ctx.arc(Math.cos(ea) * r * 0.1, Math.sin(ea) * r * 0.1, r * 0.13, 0, TAU);
    ctx.fill();
    if (e.bossKind) {
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(D.BOSS_KINDS[e.bossKind].icon, 0, -r - 8);
    }
  } else if (e.shape === "ghost") {
    ctx.globalAlpha = (e.phased ? 0.28 : 0.92) * ctx.globalAlpha;
    ctx.beginPath();
    ctx.arc(0, -r * 0.15, r, Math.PI, 0);
    for (let i = 0; i <= 4; i++) {
      ctx.lineTo(r - (i / 4) * 2 * r, r * 0.55 + Math.sin(state.time * 7 + i * 2 + e.wobbleSeed) * r * 0.18);
    }
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#0b0a14";
    ctx.beginPath();
    ctx.arc(-r * 0.32, -r * 0.2, r * 0.14, 0, TAU);
    ctx.arc(r * 0.32, -r * 0.2, r * 0.14, 0, TAU);
    ctx.fill();
  } else {
    ctx.beginPath();
    for (let i = 0; i <= 12; i++) {
      const a = (i / 12) * TAU;
      const rr = r * (1 + Math.sin(a * 3 + state.time * 5 + e.wobbleSeed) * 0.15);
      ctx[i === 0 ? "moveTo" : "lineTo"](Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }

  ctx.shadowBlur = 0;
  if (slowed) {
    ctx.strokeStyle = frozen ? "rgba(220,245,255,0.95)" : "rgba(74,217,232,0.8)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, r + 4, 0, TAU);
    ctx.stroke();
  }
  if (e.shieldHits > 0) {
    ctx.strokeStyle = `rgba(143,212,255,${0.5 + Math.sin(state.time * 6) * 0.2})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r + 7, 0, TAU);
    ctx.stroke();
  }
  if (e.elite) {
    ctx.strokeStyle = `rgba(255,201,74,${0.6 + Math.sin(state.time * 4) * 0.3})`;
    ctx.lineWidth = 2;
    if (meta.settings.cb) ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(0, 0, r + 6, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    if (e.affix) {
      ctx.fillStyle = D.ELITE_AFFIXES[e.affix].color;
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(D.ELITE_AFFIXES[e.affix].icon, 0, -r - 10);
    }
  }
  if (state.time < e.stasisUntil) {
    ctx.fillStyle = "#c084fc";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("💫", 0, -r - 8);
  }
  ctx.restore();

  if (e.hp < e.maxHp) {
    const w = e.radius * 2.2;
    const frac = clamp(e.hp / e.maxHp, 0, 1);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(e.x - w / 2, e.y - e.radius - 9, w, 4);
    ctx.fillStyle = frac > 0.5 ? "#52e5a5" : frac > 0.25 ? "#ffc94a" : "#ff5470";
    ctx.fillRect(e.x - w / 2, e.y - e.radius - 9, w * frac, 4);
  }
}

function drawGem(g) {
  const bob = Math.sin(state.time * 4 + g.seed) * 3;
  const a = g.life < 1.5 ? clamp(g.life / 1.5, 0, 1) : 1;
  ctx.save();
  ctx.translate(g.x, g.y + bob);
  ctx.rotate(Math.sin(state.time * 2 + g.seed) * 0.3);
  ctx.globalAlpha = a;
  ctx.shadowColor = "#6ee7d8";
  ctx.shadowBlur = 10;
  ctx.fillStyle = "#6ee7d8";
  ctx.beginPath();
  ctx.moveTo(0, -7); ctx.lineTo(5, 0); ctx.lineTo(0, 7); ctx.lineTo(-5, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.beginPath();
  ctx.moveTo(0, -4); ctx.lineTo(2.5, 0); ctx.lineTo(0, 4); ctx.lineTo(-2.5, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawProjectile(p) {
  for (let i = 0; i < p.trail.length; i++) {
    const tp = p.trail[i];
    ctx.globalAlpha = (i / p.trail.length) * 0.4;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(tp.x, tp.y, 2.5 * (i / p.trail.length), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.shadowColor = p.color;
  ctx.shadowBlur = 8;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(p.x, p.y, 3.2, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawShockwave(sw) {
  ctx.strokeStyle = sw.color || "rgba(82,229,165,1)";
  ctx.globalAlpha = clamp(sw.life, 0, 1) * 0.8;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(sw.x, sw.y, sw.r, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawParticle(pt) {
  ctx.globalAlpha = clamp(pt.life / pt.maxLife, 0, 1);
  ctx.fillStyle = pt.color;
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, pt.size, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawText(tx) {
  ctx.globalAlpha = clamp(tx.life, 0, 1);
  ctx.font = `700 ${tx.size}px "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.fillStyle = tx.color;
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = 4;
  ctx.fillText(tx.str, tx.x, tx.y);
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}

function drawVignette() {
  const hpFrac = clamp(state.coreHp / state.coreMaxHp, 0, 1);
  let alpha = state.corePulse * 0.35;
  if (state.running && !state.gameOver && hpFrac < 0.25) {
    alpha = Math.max(alpha, 0.12 + Math.sin(state.time * 4) * 0.08);
  }
  if (alpha <= 0.01) return;
  const g = ctx.createRadialGradient(CX, CY, Math.min(W, H) * 0.3, CX, CY, Math.max(W, H) * 0.72);
  g.addColorStop(0, "rgba(255,60,80,0)");
  g.addColorStop(1, `rgba(255,40,70,${alpha})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// ---------- Referencias DOM ----------
const uiEnergy = document.getElementById("ui-energy");
const uiWave = document.getElementById("ui-wave");
const uiScore = document.getElementById("ui-score");
const uiFrags = document.getElementById("ui-frags");
const uiRelicsWrap = document.getElementById("ui-relics-wrap");
const uiRelics = document.getElementById("ui-relics");
const coreBar = document.getElementById("core-bar");
const toolbar = document.getElementById("toolbar");
const nextWaveBtn = document.getElementById("next-wave-btn");
const banner = document.getElementById("wave-banner");
const tooltip = document.getElementById("tooltip");
const wavePreview = document.getElementById("wave-preview");
const waveProgressWrap = document.getElementById("wave-progress-wrap");
const waveProgressBar = document.getElementById("wave-progress-bar");
const waveProgressLabel = document.getElementById("wave-progress-label");
const comboWrap = document.getElementById("ui-combo-wrap");
const comboVal = document.getElementById("ui-combo");
const towerPopup = document.getElementById("tower-popup");
const toastBox = document.getElementById("toasts");

// ---------- HUD ----------
function updateHUD() {
  uiEnergy.textContent = state.energy;
  uiWave.textContent = state.endless ? `${state.wave}∞` : `${state.wave}/${WIN_WAVE}`;
  uiScore.textContent = state.score;
  uiFrags.textContent = meta.fragments;
  uiRelicsWrap.style.display = state.relics.length ? "flex" : "none";
  uiRelics.textContent = state.relics.length;
  uiRelicsWrap.title = state.relics.map(id => `${D.RELICS[id].icon} ${tn(D.RELICS[id].name)}`).join(" · ");
  const frac = clamp(state.coreHp / state.coreMaxHp, 0, 1);
  coreBar.style.width = `${frac * 100}%`;
  coreBar.style.background = frac > 0.5
    ? "linear-gradient(90deg, #52e5a5, #4ad9e8)"
    : frac > 0.25
      ? "linear-gradient(90deg, #ffc94a, #ff9a3c)"
      : "linear-gradient(90deg, #ff5470, #ff3355)";
  if (state.energy >= 500) unlockAchievement("rich");
  refreshTowerCosts();
}

function updateComboHUD() {
  const mult = 1 + Math.min(4, Math.floor(state.combo / 5));
  const show = state.combo >= 5;
  comboWrap.style.display = show ? "flex" : "none";
  if (show) comboVal.textContent = `x${mult}`;
  uiScore.textContent = state.score;
}

let bannerTimeout = null;
function showBanner(title, sub) {
  banner.innerHTML = `${title}${sub ? `<div class="sub">${sub}</div>` : ""}`;
  banner.classList.add("show");
  clearTimeout(bannerTimeout);
  bannerTimeout = setTimeout(() => banner.classList.remove("show"), 2400);
}

function showToast(icon, title, sub) {
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `<span class="t-icon">${icon}</span><div><div class="t-title">${title}</div><div class="t-sub">${sub || ""}</div></div>`;
  toastBox.appendChild(el);
  setTimeout(() => el.classList.add("out"), 3600);
  setTimeout(() => el.remove(), 4100);
}

// ---------- Barra de herramientas ----------
const towerBtns = {};
const abilityBtns = {};

function buildToolbar() {
  toolbar.innerHTML = "";
  D.TOWER_ORDER.forEach((type, i) => {
    const def = D.TOWER_TYPES[type];
    const btn = document.createElement("div");
    btn.className = "tower-btn";
    btn.dataset.type = type;
    btn.innerHTML = `<span class="key">${i + 1}</span><div class="gem" style="color:${def.color}">${def.gem}</div><div class="name">${tn(def.name)}</div><div class="cost"></div>`;
    btn.addEventListener("click", () => { ensureAudio(); selectTower(type); });
    btn.addEventListener("mouseenter", (ev) => {
      const extra = def.beam ? `${t("dpsLabel")} ${def.dmg} · ${t("rangeLabel")} ${def.range}`
        : def.chain ? `${t("dmgLabel")} ${def.dmg} ×${def.chain} · ${t("rangeLabel")} ${def.range}`
        : `${t("dmgLabel")} ${def.dmg} · ${t("rangeLabel")} ${def.range} · ${t("rateLabel")} ${def.rate}s`;
      tooltip.innerHTML = `<b>${tn(def.name)}</b> — ${towerCost(type)} 💎<div class="row">${tn(def.desc)}</div><div class="row">${extra}</div>`;
      tooltip.style.display = "block";
      positionTooltip(ev.clientX, ev.clientY);
    });
    btn.addEventListener("mousemove", (ev) => positionTooltip(ev.clientX, ev.clientY));
    btn.addEventListener("mouseleave", () => { tooltip.style.display = "none"; });
    toolbar.appendChild(btn);
    towerBtns[type] = btn;
  });

  const div = document.createElement("div");
  div.className = "tb-divider";
  toolbar.appendChild(div);

  for (const a of D.ABILITIES) {
    const btn = document.createElement("div");
    btn.className = "ability-btn";
    const key = L() === "en" ? a.keyEn : a.key;
    btn.innerHTML = `<span class="key">${key}</span><div class="gem">${a.icon}</div><div class="name">${tn(a.name)}</div><div class="cost"></div>`;
    btn.addEventListener("click", () => { ensureAudio(); useAbility(a.id); });
    btn.addEventListener("mouseenter", (ev) => {
      tooltip.innerHTML = `<b>${a.icon} ${tn(a.name)}</b><div class="row">${tn(a.desc)}</div><div class="row">CD: ${Math.round(a.cd * metaCdrMult() * relicCdMult())}s · ${key}</div>`;
      tooltip.style.display = "block";
      positionTooltip(ev.clientX, ev.clientY);
    });
    btn.addEventListener("mousemove", (ev) => positionTooltip(ev.clientX, ev.clientY));
    btn.addEventListener("mouseleave", () => { tooltip.style.display = "none"; });
    toolbar.appendChild(btn);
    abilityBtns[a.id] = btn;
  }
  refreshToolbar();
  refreshAbilityBar();
}

function refreshToolbar() {
  for (const type of D.TOWER_ORDER) {
    const btn = towerBtns[type];
    if (!btn) continue;
    const def = D.TOWER_TYPES[type];
    const locked = state.wave < def.unlockWave;
    btn.classList.toggle("locked", locked);
    btn.classList.toggle("selected", state.selectedType === type && !locked);
    btn.querySelector(".cost").textContent = locked ? t("lockedWave", def.unlockWave) : `${towerCost(type)} 💎`;
  }
  refreshTowerCosts();
}

function refreshTowerCosts() {
  for (const type of D.TOWER_ORDER) {
    const btn = towerBtns[type];
    if (!btn) continue;
    const locked = state.wave < D.TOWER_TYPES[type].unlockWave;
    btn.classList.toggle("cant", !locked && state.energy < towerCost(type));
  }
}

function refreshAbilityBar() {
  for (const a of D.ABILITIES) {
    const btn = abilityBtns[a.id];
    if (!btn) continue;
    const locked = !abilityUnlocked(a);
    const cd = state.cooldowns[a.id];
    btn.classList.toggle("locked", locked);
    btn.classList.toggle("cooling", !locked && cd > 0);
    btn.classList.toggle("ready", !locked && cd <= 0 && state.running && !state.gameOver);
    btn.querySelector(".cost").textContent = locked ? t("lockedWave", a.unlock) : cd > 0 ? `${Math.ceil(cd)}s` : t("ready");
  }
}

function shakeTowerBtn(type) {
  const btn = towerBtns[type];
  if (!btn) return;
  btn.classList.remove("shake");
  void btn.offsetWidth;
  btn.classList.add("shake");
}

function positionTooltip(mx, my) {
  tooltip.style.left = `${Math.min(mx + 16, window.innerWidth - 270)}px`;
  tooltip.style.top = `${Math.max(8, my - 80)}px`;
}

function selectTower(type) {
  if (state.wave < D.TOWER_TYPES[type].unlockWave) { sfx.error(); return; }
  state.selectedType = type;
  refreshToolbar();
}

function showWavePreview() {
  const next = state.wave + 1;
  const c = D.waveComposition(next);
  const mut = mutatorForWave(next);
  const parts = Object.keys(c).map(type => {
    const col = meta.settings.cb ? D.ENEMY_COLORS_CB[type] : D.ENEMY_TYPES[type].color;
    let k = c[type];
    if (mut && mut.count && type !== "boss" && type !== "mega") k = Math.round(k * mut.count);
    return `<span class="ico" style="color:${col}">${D.ENEMY_ICONS[type]}</span>×${k}`;
  });
  const mutStr = mut ? ` &nbsp;·&nbsp; <span class="mut">${mut.icon} ${tn(mut.name)}</span>` : "";
  wavePreview.innerHTML = `${t("waveN")} ${next}: &nbsp;${parts.join(" &nbsp;")}${mutStr}`;
  wavePreview.style.display = "block";
}

// ---------- Popup de torre / evolución ----------
let popupTower = null;
function mkPopupBtn(html, fn, disabled) {
  const b = document.createElement("button");
  b.innerHTML = html;
  b.disabled = !!disabled;
  b.addEventListener("click", (ev) => { ev.stopPropagation(); fn(); });
  towerPopup.appendChild(b);
  return b;
}
function positionPopup(tw) {
  towerPopup.style.display = "block";
  towerPopup.style.left = `${clamp(tw.x + 24, 8, W - 260)}px`;
  towerPopup.style.top = `${clamp(tw.y - 60, 8, H - 220)}px`;
}

function showTowerPopup(tw) {
  popupTower = tw;
  towerPopup.innerHTML = "";
  if (tw.level >= MAX_LEVEL && !tw.evo) {
    mkPopupBtn(t("evolveTitle"), () => openEvolvePopup(tw));
  } else if (tw.level < MAX_LEVEL) {
    const c = upgradeCostOf(tw);
    mkPopupBtn(t("upgradeFor", c), () => { tryUpgrade(tw); if (state.towers.includes(tw)) showTowerPopup(tw); }, state.energy < c);
  }
  mkPopupBtn(`${t("prio")} ${prioLabel(tw.priority)}`, () => { cyclePriority(tw); showTowerPopup(tw); });
  mkPopupBtn(t("sellFor", Math.round(tw.invested * ECON.sellRefund)), () => sellTower(tw));
  positionPopup(tw);
}

function openEvolvePopup(tw) {
  popupTower = tw;
  towerPopup.innerHTML = "";
  const cost = evolveCost();
  for (const evo of D.EVOLUTIONS[tw.type]) {
    mkPopupBtn(
      `${evo.icon} <b>${tn(evo.name)}</b> — ${cost} 💎<div class="evo-desc">${tn(evo.desc)}</div>`,
      () => { if (evolveTower(tw, evo.id)) hideTowerPopup(); },
      state.energy < cost
    );
  }
  mkPopupBtn("✕", hideTowerPopup);
  positionPopup(tw);
}

function hideTowerPopup() {
  popupTower = null;
  towerPopup.style.display = "none";
}

// ---------- Entrada ----------
canvas.addEventListener("mousemove", (ev) => {
  state.mouseX = ev.clientX;
  state.mouseY = ev.clientY;
  state.hoverTower = towerAt(ev.clientX, ev.clientY);
  if (state.hoverTower && state.running && !state.gameOver) {
    const tw = state.hoverTower;
    const def = D.TOWER_TYPES[tw.type];
    const st = towerStats(tw);
    const up = tw.level >= MAX_LEVEL
      ? (tw.evo ? t("maxLevel") : t("clickEvolve"))
      : t("clickUpgrade", upgradeCostOf(tw));
    const vet = vetMult(tw) > 1 ? ` · ★+${Math.round((vetMult(tw) - 1) * 100)}%` : "";
    const evoStr = tw.evo ? ` · ${D.EVOLUTIONS[tw.type].find(e => e.id === tw.evo).icon}` : "";
    const synStr = st.syn.list.length
      ? `<div class="row">${t("synergy")}: ${st.syn.list.map(k => D.TOWER_TYPES[k].gem + " " + tn(D.SYNERGIES[k].label)).join(", ")}</div>` : "";
    const empStr = tw.empowered ? `<div class="row">${t("empowered")}</div>` : "";
    tooltip.innerHTML = `<b>${tn(def.name)}</b> · ${t("lvl")} ${tw.level + 1}${evoStr} · ${tw.kills} ${t("kills")}${vet}` +
      `<div class="row">${t("dmgLabel")} ${st.dmg.toFixed(0)} · ${t("rangeLabel")} ${st.range.toFixed(0)} · 🎯 ${prioLabel(tw.priority)}</div>` +
      synStr + empStr +
      `<div class="row">${up}</div><div class="row">${t("rightSell", Math.round(tw.invested * ECON.sellRefund))}</div>`;
    tooltip.style.display = "block";
    positionTooltip(ev.clientX, ev.clientY);
    canvas.style.cursor = "pointer";
  } else {
    tooltip.style.display = "none";
    canvas.style.cursor = "crosshair";
  }
});

canvas.addEventListener("click", (ev) => {
  if (!state.running || state.gameOver || state.paused || state.drafting) return;
  ensureAudio();
  if (popupTower) { hideTowerPopup(); return; }
  const tw = towerAt(ev.clientX, ev.clientY);
  if (tw) {
    if (pointerCoarse) showTowerPopup(tw);
    else tryUpgrade(tw);
  } else {
    placeTower(ev.clientX, ev.clientY);
  }
});

canvas.addEventListener("contextmenu", (ev) => {
  ev.preventDefault();
  if (!state.running || state.gameOver || state.paused || state.drafting) return;
  const tw = towerAt(ev.clientX, ev.clientY);
  if (tw) sellTower(tw);
});

canvas.addEventListener("touchmove", (ev) => {
  if (ev.touches.length) {
    state.mouseX = ev.touches[0].clientX;
    state.mouseY = ev.touches[0].clientY;
  }
}, { passive: true });

function setPause(on) {
  if (!state.running || state.gameOver || state.drafting) return;
  state.paused = on;
  document.getElementById("paused").classList.toggle("hidden", !on);
}

function overlayOpen(id) { return !document.getElementById(id).classList.contains("hidden"); }

function openHelp() {
  if (state.running && !state.gameOver && state.phase === "wave") setPause(true);
  document.getElementById("help-content").innerHTML = D.STRINGS[L()].helpBody;
  document.getElementById("help").classList.remove("hidden");
}
function closeHelp() { document.getElementById("help").classList.add("hidden"); }

window.addEventListener("keydown", (ev) => {
  if (ev.code === "Space") {
    ev.preventDefault();
    ensureAudio();
    useAbility("pulse");
    return;
  }
  if (ev.code === "KeyH") { overlayOpen("help") ? closeHelp() : openHelp(); return; }
  if (ev.code === "KeyP" || ev.code === "Escape") {
    if (overlayOpen("help")) { closeHelp(); return; }
    if (overlayOpen("settings")) { closeSettings(); return; }
    setPause(!state.paused);
    return;
  }
  if (ev.code === "KeyM") { ensureAudio(); toggleMute(); return; }
  if (ev.code === "Equal" || ev.code === "NumpadAdd") { ensureAudio(); setVolume(meta.volume + 0.1); showToast("🎚️", t("volume", Math.round(meta.volume * 100)), "+/-"); return; }
  if (ev.code === "Minus" || ev.code === "NumpadSubtract") { ensureAudio(); setVolume(meta.volume - 0.1); showToast("🎚️", t("volume", Math.round(meta.volume * 100)), "+/-"); return; }
  if (state.paused || state.drafting) return;
  if (ev.code === "KeyQ") { ensureAudio(); useAbility("storm"); return; }
  if (ev.code === "KeyE") { ensureAudio(); useAbility("shield"); return; }
  if (ev.code === "KeyR") { ensureAudio(); useAbility("over"); return; }
  if (ev.code === "KeyT" && state.hoverTower) { cyclePriority(state.hoverTower); return; }
  const idx = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6"].indexOf(ev.code);
  if (idx >= 0) { selectTower(D.TOWER_ORDER[idx]); return; }
  if (ev.code === "Enter" && state.phase === "build" && state.running && !state.gameOver && state.wave > 0) {
    startWave(true);
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && state.running && !state.gameOver && state.phase === "wave") setPause(true);
});
window.addEventListener("blur", () => {
  if (state.running && !state.gameOver && state.phase === "wave") setPause(true);
});

nextWaveBtn.addEventListener("click", () => { ensureAudio(); if (!state.drafting) startWave(true); });
document.getElementById("help-btn").addEventListener("click", openHelp);
document.getElementById("help-close").addEventListener("click", closeHelp);
document.getElementById("resume-btn").addEventListener("click", () => setPause(false));
document.getElementById("restart-btn").addEventListener("click", () => {
  document.getElementById("paused").classList.add("hidden");
  state.paused = false;
  resetGame(state.difficulty, state.daily ? { seed: state.seed, daily: true } : undefined);
});
document.getElementById("tomenu-btn").addEventListener("click", () => {
  document.getElementById("paused").classList.add("hidden");
  state.paused = false;
  goToMenu();
});

// ---------- Ajustes ----------
function buildSettings() {
  const box = document.getElementById("settings-box");
  box.innerHTML = "";
  const S = meta.settings;
  const mkSwitch = (label, key) => {
    const row = document.createElement("div");
    row.className = "set-row";
    row.innerHTML = `<span>${label}</span>`;
    const sw = document.createElement("label");
    sw.className = "switch";
    sw.innerHTML = `<input type="checkbox" ${S[key] ? "checked" : ""}><span class="sl"></span>`;
    sw.querySelector("input").addEventListener("change", (ev) => {
      S[key] = ev.target.checked;
      metaSave();
      if (key === "cb") showWavePreviewIfBuild();
    });
    row.appendChild(sw);
    box.appendChild(row);
  };
  mkSwitch(t("sShake"), "shake");
  mkSwitch(t("sReduced"), "reduced");
  mkSwitch(t("sCb"), "cb");

  const rowT = document.createElement("div");
  rowT.className = "set-row";
  rowT.innerHTML = `<span>${t("sTextScale")}</span>`;
  const sel = document.createElement("select");
  [["0.85", "S"], ["1", "M"], ["1.25", "L"], ["1.5", "XL"]].forEach(([v, l]) => {
    const o = document.createElement("option");
    o.value = v; o.textContent = l;
    if (Number(v) === S.textScale) o.selected = true;
    sel.appendChild(o);
  });
  sel.addEventListener("change", () => { S.textScale = Number(sel.value); metaSave(); });
  rowT.appendChild(sel);
  box.appendChild(rowT);

  const rowV = document.createElement("div");
  rowV.className = "set-row";
  rowV.innerHTML = `<span>${t("sVolume")}</span>`;
  const rng = document.createElement("input");
  rng.type = "range"; rng.min = "0"; rng.max = "1"; rng.step = "0.1"; rng.value = meta.volume;
  rng.addEventListener("input", () => { ensureAudio(); setVolume(Number(rng.value)); });
  rowV.appendChild(rng);
  box.appendChild(rowV);

  const rowL = document.createElement("div");
  rowL.className = "set-row";
  rowL.innerHTML = `<span>${t("sLang")}</span>`;
  const selL = document.createElement("select");
  [["es", "Español"], ["en", "English"]].forEach(([v, l]) => {
    const o = document.createElement("option");
    o.value = v; o.textContent = l;
    if (v === S.lang) o.selected = true;
    selL.appendChild(o);
  });
  selL.addEventListener("change", () => {
    S.lang = selL.value;
    metaSave();
    applyI18n();
    buildSettings();
  });
  rowL.appendChild(selL);
  box.appendChild(rowL);
}
function showWavePreviewIfBuild() {
  if (state.running && state.phase === "build" && state.wave >= 0) showWavePreview();
}
function openSettings() {
  buildSettings();
  document.getElementById("settings").classList.remove("hidden");
}
function closeSettings() { document.getElementById("settings").classList.add("hidden"); }

document.getElementById("settings-btn").addEventListener("click", openSettings);
document.getElementById("settings-close").addEventListener("click", closeSettings);

// Exportar / importar progreso (código base64 con versión)
function encodeMeta() {
  return btoa(unescape(encodeURIComponent(JSON.stringify({ v: 3, meta }))));
}
document.getElementById("export-btn").addEventListener("click", () => {
  window.prompt(t("exportMsg"), encodeMeta());
});
document.getElementById("import-btn").addEventListener("click", () => {
  const code = window.prompt(t("importMsg"), "");
  if (!code) return;
  try {
    const obj = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
    if (!obj || obj.v !== 3 || !obj.meta || typeof obj.meta.fragments !== "number") throw new Error("bad");
    Object.assign(meta, obj.meta);
    meta.settings = { ...meta.settings, ...(obj.meta.settings || {}) };
    metaSave();
    showToast("📥", t("importOk"), "");
    applyI18n();
    showMenu();
  } catch (e) {
    showToast("⚠️", t("importBad"), "");
  }
});

// ---------- Menú ----------
let menuDifficulty = "normal";

function buildDifficultyRow() {
  const row = document.getElementById("difficulty-row");
  row.innerHTML = "";
  for (const key in D.DIFFICULTIES) {
    const d = D.DIFFICULTIES[key];
    const btn = document.createElement("button");
    btn.className = "diff-btn" + (menuDifficulty === key ? " selected" : "");
    btn.style.color = menuDifficulty === key ? d.color : "";
    btn.textContent = tn(d.name);
    btn.addEventListener("click", () => { menuDifficulty = key; buildDifficultyRow(); });
    row.appendChild(btn);
  }
}

function buildShop() {
  const grid = document.getElementById("shop-grid");
  grid.innerHTML = "";
  for (const item of D.SHOP) {
    const lv = meta.upgrades[item.id];
    const maxed = lv >= item.max;
    const cost = D.shopCost(lv);
    const el = document.createElement("div");
    el.className = "shop-item";
    el.innerHTML = `<span class="s-icon">${item.icon}</span>` +
      `<div class="s-body"><div class="s-name">${tn(item.name)} <span class="s-pips">${"◆".repeat(lv)}${"◇".repeat(item.max - lv)}</span></div>` +
      `<div class="s-desc">${tn(item.desc)}</div></div>`;
    const btn = document.createElement("button");
    btn.textContent = maxed ? "MÁX" : `${cost} 💠`;
    btn.disabled = maxed || meta.fragments < cost;
    btn.addEventListener("click", () => {
      if (maxed || meta.fragments < cost) return;
      meta.fragments -= cost;
      meta.upgrades[item.id]++;
      metaSave();
      sfx.upgrade();
      buildShop();
      updateMetaRow();
    });
    el.appendChild(btn);
    grid.appendChild(el);
  }
}

function buildAchGrid() {
  const gridEl = document.getElementById("ach-grid");
  gridEl.innerHTML = "";
  let done = 0;
  for (const a of D.ACHIEVEMENTS) {
    const got = !!meta.ach[a.id];
    if (got) done++;
    const el = document.createElement("div");
    el.className = "ach " + (got ? "done" : "locked");
    el.textContent = a.icon;
    el.title = `${tn(a.name)} — ${tn(a.desc)} (+${a.frag} 💠)`;
    gridEl.appendChild(el);
  }
  document.getElementById("ach-title").textContent = `${t("achTitle")} ${done}/${D.ACHIEVEMENTS.length}`;
}

function buildHistory() {
  const list = document.getElementById("history-list");
  list.innerHTML = "";
  for (const h of meta.history) {
    const d = new Date(h.d);
    const dt = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
    const badge = h.win ? "👑" : h.daily ? "📅" : "💀";
    const row = document.createElement("div");
    row.className = "h-row";
    row.innerHTML = `<span>${badge} ${dt}</span><span>${t("waveN")} <b>${h.wave}</b></span><span><b>${h.score}</b> ⭐</span><span>${tn(D.DIFFICULTIES[h.diff].name)}</span>`;
    list.appendChild(row);
  }
}

function updateMetaRow() {
  document.getElementById("meta-row").innerHTML =
    `${t("best")}: <b>${meta.best}</b> &nbsp;·&nbsp; ${t("fragments")}: <b>${meta.fragments} 💠</b> &nbsp;·&nbsp; ${t("totalKills")}: <b>${meta.totalKills}</b>`;
  const today = new Date().toISOString().slice(0, 10);
  const el = document.getElementById("daily-best-row");
  el.textContent = (meta.daily && meta.daily.date === today) ? `${t("dailyBest")}: ${meta.daily.best} ⭐` : "";
  updateHUD();
}

function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.getElementById("menu-intro").innerHTML = t("intro");
  document.getElementById("menu-help-hint").innerHTML = t("helpHint");
  buildToolbar();
  buildAchGrid();
  buildShop();
  buildHistory();
  buildDifficultyRow();
  updateMetaRow();
}

function showMenu() {
  buildDifficultyRow();
  buildShop();
  buildAchGrid();
  buildHistory();
  updateMetaRow();
  document.getElementById("continue-btn").classList.toggle("hidden", !getSave());
  document.getElementById("menu").classList.remove("hidden");
}

function goToMenu() {
  state.running = false;
  state.gameOver = false;
  state.drafting = false;
  setBossMusic(false);
  nextWaveBtn.style.display = "none";
  wavePreview.style.display = "none";
  waveProgressWrap.style.display = "none";
  hideTowerPopup();
  setTutStep(0);
  document.getElementById("gameover").classList.add("hidden");
  document.getElementById("victory").classList.add("hidden");
  document.getElementById("draft").classList.add("hidden");
  showMenu();
}

// ---------- Inicio / reinicio ----------
function resetGame(difficulty, opts) {
  opts = opts || {};
  state.running = true;
  state.gameOver = false;
  state.paused = false;
  state.drafting = false;
  state.endless = false;
  state.daily = !!opts.daily;
  state.seed = opts.seed !== undefined ? opts.seed : ((Math.random() * 0x7fffffff) | 0);
  state.difficulty = difficulty || menuDifficulty;
  state.energy = metaStartEnergy();
  state.score = 0;
  state.wave = 0;
  state.coreMaxHp = metaCoreHp();
  state.coreHp = state.coreMaxHp;
  state.corePulse = 0;
  state.selectedType = "ruby";
  state.phase = "build";
  state.autoStartTimer = 30;
  state.cooldowns = { pulse: 0, storm: 0, shield: 0, over: 0 };
  state.shieldUntil = 0;
  state.overUntil = 0;
  state.spawnQueue = [];
  state.waveTotal = 0;
  state.waveDamageTaken = 0;
  state.waveRng = D.mulberry32(hash2(state.seed, 0));
  state.mutator = null;
  state.relics = [];
  state.towers = [];
  state.enemies = [];
  state.projectiles = [];
  state.particles = [];
  state.gems = [];
  state.beams = [];
  state.texts = [];
  state.shockwaves = [];
  state.timers = [];
  state.waveLog = [];
  state.combo = 0;
  state.comboTimer = 0;
  state.time = 0;
  state.shake = 0;
  state.stats = freshStats();
  genTerrain();
  buildBackdrop();
  hideTowerPopup();
  document.getElementById("gameover").classList.add("hidden");
  document.getElementById("victory").classList.add("hidden");
  document.getElementById("menu").classList.add("hidden");
  document.getElementById("paused").classList.add("hidden");
  document.getElementById("draft").classList.add("hidden");
  setBossMusic(false);
  updateComboHUD();
  refreshToolbar();
  refreshAbilityBar();
  updateHUD();
  if (state.daily) {
    showBanner(t("dailyRun"), t("dailySub", state.seed));
  } else {
    showBanner(t("getReady"), t("getReadySub", tn(diff().name)));
  }
  nextWaveBtn.style.display = "block";
  nextWaveBtn.textContent = t("firstWave");
  showWavePreview();
  waveProgressWrap.style.display = "none";
  if (!meta.tutorialDone && !opts.skipTutorial && !opts.daily) setTutStep(1);
  else setTutStep(0);
}

document.getElementById("start-btn").addEventListener("click", () => { ensureAudio(); deleteSave(); resetGame(); });
document.getElementById("daily-btn").addEventListener("click", () => {
  ensureAudio();
  deleteSave();
  resetGame("normal", { daily: true, seed: D.seedFromDate(new Date()) });
});
document.getElementById("continue-btn").addEventListener("click", () => {
  ensureAudio();
  document.getElementById("menu").classList.add("hidden");
  if (!loadGame()) resetGame();
  else nextWaveBtn.style.display = "block";
});
document.getElementById("retry-btn").addEventListener("click", () => {
  ensureAudio();
  resetGame(state.difficulty, state.daily ? { daily: true, seed: state.seed } : undefined);
});
document.getElementById("gomenu-btn").addEventListener("click", goToMenu);
document.getElementById("endless-btn").addEventListener("click", () => {
  ensureAudio();
  state.running = true;
  state.endless = true;
  document.getElementById("victory").classList.add("hidden");
  state.phase = "build";
  state.autoStartTimer = 25;
  nextWaveBtn.style.display = "block";
  showWavePreview();
  showBanner(t("endlessBanner"), t("endlessSub"));
  saveGame();
  updateHUD();
});
document.getElementById("vmenu-btn").addEventListener("click", goToMenu);

// ---------- Arranque ----------
resize();
applyI18n();
showMenu();
updateHUD();
requestAnimationFrame(frame);
