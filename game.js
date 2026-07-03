/* =========================================================
   GEODA — Defiende el Núcleo · v2 "Edición Profunda"
   Tower defense en canvas puro, sin dependencias.
   ========================================================= */
"use strict";

// ---------- Utilidades ----------
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const pick = (arr) => arr[randInt(0, arr.length - 1)];

const WIN_WAVE = 25;
const SAVE_KEY = "geoda_save_v2";
const META_KEY = "geoda_meta_v2";
const pointerCoarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

// ---------- Meta-progresión persistente ----------
function loadMeta() {
  const def = {
    fragments: 0,
    upgrades: { core: 0, energy: 0, dmg: 0, cdr: 0, discount: 0 },
    ach: {},
    best: Number(localStorage.getItem("geoda_best") || 0), // migra v1
    totalKills: 0,
    muted: localStorage.getItem("geoda_muted") === "1",     // migra v1
    volume: 1,
  };
  try {
    const raw = localStorage.getItem(META_KEY);
    if (raw) {
      const m = JSON.parse(raw);
      return { ...def, ...m, upgrades: { ...def.upgrades, ...(m.upgrades || {}) }, ach: m.ach || {} };
    }
  } catch (e) { /* meta corrupta: empezar de cero */ }
  return def;
}
const meta = loadMeta();
function metaSave() { localStorage.setItem(META_KEY, JSON.stringify(meta)); }

const metaCoreHp = () => 100 + 15 * meta.upgrades.core;
const metaStartEnergy = () => 160 + 30 * meta.upgrades.energy;
const metaDmgMult = () => 1 + 0.05 * meta.upgrades.dmg;
const metaCdrMult = () => 1 - 0.10 * meta.upgrades.cdr;
const metaCostMult = () => 1 - 0.05 * meta.upgrades.discount;

const SHOP = [
  { id: "core", icon: "🔮", name: "Núcleo reforzado", desc: "+15 de vida máxima del núcleo", max: 3 },
  { id: "energy", icon: "💎", name: "Reservas profundas", desc: "+30 de energía inicial", max: 3 },
  { id: "dmg", icon: "⚔️", name: "Cristales afilados", desc: "+5% de daño de todas las torres", max: 3 },
  { id: "cdr", icon: "⏱️", name: "Condensador arcano", desc: "-10% de recarga de habilidades", max: 3 },
  { id: "discount", icon: "🏷️", name: "Cantera eficiente", desc: "-5% de coste de las torres", max: 3 },
];
const shopCost = (level) => 30 * (level + 1);

// ---------- Logros ----------
const ACHIEVEMENTS = [
  { id: "first", icon: "🩸", name: "Primera sangre", desc: "Destruye tu primera sombra", frag: 5 },
  { id: "builder", icon: "🏗️", name: "Constructor", desc: "Construye 10 torres en una partida", frag: 10 },
  { id: "rich", icon: "💰", name: "Economista", desc: "Acumula 500 de energía", frag: 10 },
  { id: "combo", icon: "🔥", name: "Imparable", desc: "Alcanza un combo x5", frag: 15 },
  { id: "boss", icon: "☠️", name: "Cazajefes", desc: "Derrota a un jefe", frag: 15 },
  { id: "mega", icon: "💀", name: "Megacazador", desc: "Derrota a un mega-jefe", frag: 25 },
  { id: "perfect", icon: "✨", name: "Impecable", desc: "Supera una oleada sin daño al núcleo", frag: 10 },
  { id: "vet", icon: "🎖️", name: "Veterano", desc: "Alcanza la oleada 10", frag: 15 },
  { id: "legend", icon: "👑", name: "Leyenda de la caverna", desc: "Sobrevive a las 25 oleadas", frag: 50 },
  { id: "gems", icon: "💠", name: "Coleccionista", desc: "Recoge 20 gemas en una partida", frag: 10 },
  { id: "crit", icon: "⚡", name: "Golpe maestro", desc: "Asesta 50 críticos en una partida", frag: 10 },
  { id: "kills", icon: "🌌", name: "Demoledor", desc: "1000 bajas acumuladas en total", frag: 30 },
];
function unlockAchievement(id) {
  if (meta.ach[id]) return;
  const a = ACHIEVEMENTS.find(x => x.id === id);
  if (!a) return;
  meta.ach[id] = true;
  meta.fragments += a.frag;
  metaSave();
  showToast(a.icon, `Logro: ${a.name}`, `${a.desc} · +${a.frag} 💠`);
  sfx.achieve();
  updateHUD();
}

// ---------- Dificultades ----------
const DIFFICULTIES = {
  relajado: { name: "Relajado", hp: 0.75, speed: 0.9, bounty: 1.2, score: 0.7, color: "#52e5a5" },
  normal: { name: "Normal", hp: 1, speed: 1, bounty: 1, score: 1, color: "#8c78ff" },
  pesadilla: { name: "Pesadilla", hp: 1.45, speed: 1.12, bounty: 0.85, score: 1.6, color: "#ff5470" },
};
const diff = () => DIFFICULTIES[state.difficulty];

// ---------- Canvas ----------
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
let W = 0, H = 0, CX = 0, CY = 0;

function resize() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
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
  // Capa base: drone ambiental con osciladores desafinados
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
  // Capa de tensión: se activa en oleadas de jefe
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
  const t = audioCtx.currentTime;
  bossGain.gain.cancelScheduledValues(t);
  bossGain.gain.linearRampToValueAtTime(on && !meta.muted ? 0.03 : 0, t + 1.2);
}

function toggleMute() {
  meta.muted = !meta.muted;
  metaSave();
  if (musicGain) musicGain.gain.value = meta.muted ? 0 : 0.035;
  if (bossGain && meta.muted) bossGain.gain.value = 0;
  showToast("🔊", meta.muted ? "Silenciado" : "Sonido activado", "Tecla M");
  if (!meta.muted) beep(660, 0.1, "sine", 0.06, 100);
}

function changeVolume(delta) {
  meta.volume = clamp(Math.round((meta.volume + delta) * 10) / 10, 0, 1);
  metaSave();
  if (masterGain) masterGain.gain.value = meta.volume;
  showToast("🎚️", `Volumen ${Math.round(meta.volume * 100)}%`, "Teclas + / -");
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
};

// ---------- Torres ----------
const TOWER_TYPES = {
  ruby: {
    name: "Rubí", gem: "🔴", color: "#ff5470", glow: "rgba(255,84,112,",
    cost: 60, dmg: 8, rate: 0.35, range: 140, projSpeed: 520,
    desc: "Disparo rápido a un objetivo.", unlockWave: 0,
  },
  sapphire: {
    name: "Zafiro", gem: "🔵", color: "#4ad9e8", glow: "rgba(74,217,232,",
    cost: 80, dmg: 4, rate: 0.5, range: 130, projSpeed: 460,
    slowFactor: 0.5, slowTime: 1.6,
    desc: "Ralentiza a los enemigos un 50%.", unlockWave: 0,
  },
  emerald: {
    name: "Esmeralda", gem: "🟢", color: "#52e5a5", glow: "rgba(82,229,165,",
    cost: 110, dmg: 12, rate: 0.9, range: 150, projSpeed: 380, splash: 62,
    desc: "Explosión con daño en área.", unlockWave: 2,
  },
  amethyst: {
    name: "Amatista", gem: "🟣", color: "#b06df0", glow: "rgba(176,109,240,",
    cost: 130, dmg: 11, rate: 0.85, range: 160, chain: 4, chainRange: 120,
    desc: "Rayo que salta entre 4 enemigos.", unlockWave: 3,
  },
  amber: {
    name: "Ámbar", gem: "🟡", color: "#ffc94a", glow: "rgba(255,201,74,",
    cost: 150, dmg: 42, rate: 1.7, range: 270, projSpeed: 780, pierce: 3,
    desc: "Francotirador: perfora hasta 3 enemigos.", unlockWave: 4,
  },
  diamond: {
    name: "Diamante", gem: "⚪", color: "#e8f4ff", glow: "rgba(232,244,255,",
    cost: 200, dmg: 26, range: 175, beam: true,
    desc: "Láser continuo que se intensifica.", unlockWave: 6,
  },
};
const TOWER_ORDER = ["ruby", "sapphire", "emerald", "amethyst", "amber", "diamond"];
const TOWER_RADIUS = 16;
const MIN_TOWER_GAP = 44;
const CORE_RADIUS = 34;
const CORE_EXCLUSION = 78;
const MAX_LEVEL = 4; // niveles 0..4 => "Nivel 1..5"
const PRIORITIES = ["core", "strong", "weak"];
const PRIORITY_LABELS = { core: "Cercano al núcleo", strong: "Más fuerte", weak: "Más débil" };

// ---------- Enemigos ----------
const ENEMY_TYPES = {
  mote: { hp: 22, speed: 52, radius: 11, dmg: 8, bounty: 8, score: 10, color: "#b06df0", shape: "blob" },
  swift: { hp: 12, speed: 105, radius: 8, dmg: 5, bounty: 10, score: 15, color: "#ff8ac2", shape: "tri" },
  brute: { hp: 95, speed: 30, radius: 18, dmg: 20, bounty: 24, score: 40, color: "#7a5cff", shape: "hex" },
  splitter: { hp: 40, speed: 44, radius: 14, dmg: 10, bounty: 14, score: 25, color: "#e06dd8", shape: "blob", splits: 2 },
  healer: { hp: 55, speed: 34, radius: 14, dmg: 10, bounty: 22, score: 45, color: "#7dffa8", shape: "healer" },
  ghost: { hp: 34, speed: 62, radius: 12, dmg: 12, bounty: 18, score: 35, color: "#8fd4ff", shape: "ghost" },
  armored: { hp: 130, speed: 26, radius: 16, dmg: 18, bounty: 26, score: 50, color: "#9aa7c7", shape: "armored", slowImmune: true, critImmune: true },
  digger: { hp: 60, speed: 48, radius: 13, dmg: 16, bounty: 20, score: 40, color: "#d8a05c", shape: "digger" },
  boss: { hp: 700, speed: 20, radius: 34, dmg: 60, bounty: 160, score: 400, color: "#ff4a6e", shape: "boss" },
  mega: { hp: 2200, speed: 13, radius: 48, dmg: 100, bounty: 420, score: 1200, color: "#ff2255", shape: "boss", mega: true },
};
const ENEMY_ICONS = {
  mote: "●", swift: "▲", brute: "⬢", splitter: "◐", healer: "✚",
  ghost: "👻", armored: "▣", digger: "⛏", boss: "☠", mega: "💀",
};

// ---------- Habilidades ----------
const ABILITIES = [
  { id: "pulse", icon: "⚡", name: "Pulso", key: "ESP", code: "Space", cd: 25, unlock: 0, desc: "Onda que daña y empuja alrededor del núcleo." },
  { id: "storm", icon: "☄️", name: "Tormenta", key: "Q", code: "KeyQ", cd: 45, unlock: 3, desc: "12 meteoros de cristal caen sobre los enemigos." },
  { id: "shield", icon: "🛡️", name: "Escudo", key: "E", code: "KeyE", cd: 60, unlock: 5, desc: "El núcleo es invulnerable durante 4 segundos." },
  { id: "over", icon: "🔥", name: "Sobrecarga", key: "R", code: "KeyR", cd: 50, unlock: 8, desc: "Las torres disparan el doble de rápido 6 segundos." },
];

// ---------- Estado ----------
const state = {
  running: false,
  gameOver: false,
  paused: false,
  endless: false,
  difficulty: "normal",
  energy: 0,
  score: 0,
  wave: 0,
  coreHp: 100,
  coreMaxHp: 100,
  corePulse: 0,
  selectedType: "ruby",
  phase: "build",
  autoStartTimer: 0,
  cooldowns: { pulse: 0, storm: 0, shield: 0, over: 0 },
  shieldUntil: 0,
  overUntil: 0,
  spawnQueue: [],
  waveTotal: 0,
  waveDamageTaken: 0,
  spawnTimer: 0,
  towers: [],
  enemies: [],
  projectiles: [],
  particles: [],
  gems: [],
  beams: [],
  texts: [],
  shockwaves: [],
  timers: [],
  combo: 0,
  comboTimer: 0,
  time: 0,
  shake: 0,
  hoverTower: null,
  mouseX: 0, mouseY: 0,
  stats: null,
};
function freshStats() {
  return { kills: 0, dmgDealt: 0, towersBuilt: 0, perfectWaves: 0, gems: 0, crits: 0 };
}
state.stats = freshStats();

// ---------- Fondo, luciérnagas y grietas ----------
let backdrop = null;
let fireflies = [];
let crackSegs = [];

function buildBackdrop() {
  backdrop = document.createElement("canvas");
  backdrop.width = W; backdrop.height = H;
  const b = backdrop.getContext("2d");

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
    b.moveTo(0, -s * 1.6);
    b.lineTo(s, 0);
    b.lineTo(0, s * 1.6);
    b.lineTo(-s, 0);
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

// ---------- Composición de oleadas ----------
function countComposition(n) {
  const c = {};
  const add = (t, k) => { k = Math.floor(k); if (k > 0) c[t] = (c[t] || 0) + k; };
  if (n % 10 === 0) {
    add("mega", Math.floor(n / 20) + 1);
    add("brute", n / 4);
    add("swift", n);
  } else if (n % 5 === 0) {
    add("boss", Math.floor(n / 15) + 1);
    add("brute", n / 3);
    add("swift", 4 + n * 0.6);
  } else {
    add("mote", 5 + n * 1.5);
    if (n >= 2) add("swift", 2 + n * 0.8);
    if (n >= 3) add("splitter", n / 2);
    if (n >= 4) add("brute", n / 2);
    if (n >= 5) add("healer", n / 4);
    if (n >= 6) add("ghost", n / 3);
    if (n >= 7) add("armored", n / 3);
    if (n >= 8) add("digger", n / 4);
  }
  return c;
}

function buildQueue(n) {
  const c = countComposition(n);
  const list = [];
  for (const type in c) for (let i = 0; i < c[type]; i++) list.push(type);
  for (let i = list.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function hpMultiplier(n) { return 1 + (n - 1) * 0.22; }
const isBossWave = (n) => n % 5 === 0;

function startWave(manual) {
  if (manual && state.autoStartTimer > 0) {
    const bonus = Math.floor(state.autoStartTimer / 2);
    if (bonus > 0) {
      state.energy += bonus;
      addText(CX, CY - CORE_RADIUS - 44, `+${bonus} 💎 por adelantar`, "#ffe08a", 14);
    }
  }
  state.wave++;
  state.phase = "wave";
  state.spawnQueue = buildQueue(state.wave);
  state.waveTotal = state.spawnQueue.length;
  state.waveDamageTaken = 0;
  state.spawnTimer = 0.8;
  nextWaveBtn.style.display = "none";
  wavePreview.style.display = "none";
  waveProgressWrap.style.display = "block";
  const boss = isBossWave(state.wave);
  showBanner(boss ? `⚠ OLEADA ${state.wave} ⚠` : `OLEADA ${state.wave}`,
    state.wave % 10 === 0 ? "¡Un MEGA-JEFE se acerca!" : boss ? "¡Un jefe se acerca!" : "");
  (boss ? sfx.boss : sfx.wave)();
  setBossMusic(boss);
  if (state.wave >= 10) unlockAchievement("vet");
  refreshToolbar();
  refreshAbilityBar();
  updateHUD();
}

function endWave() {
  state.phase = "build";
  state.autoStartTimer = 20;
  const bonus = 30 + state.wave * 6;
  const interest = Math.min(50, Math.floor(state.energy * 0.05));
  state.energy += bonus + interest;
  addScore(state.wave * 20);
  addText(CX, CY - CORE_RADIUS - 26, `+${bonus} 💎 oleada superada`, "#52e5a5", 16);
  if (interest > 0) addText(CX, CY - CORE_RADIUS - 46, `+${interest} 💎 interés`, "#ffe08a", 13);
  if (state.waveDamageTaken === 0) {
    state.energy += 25;
    state.stats.perfectWaves++;
    addText(CX, CY - CORE_RADIUS - 66, "✨ ¡Oleada perfecta! +25 💎", "#ffc94a", 14);
    unlockAchievement("perfect");
  }
  state.coreHp = Math.min(state.coreMaxHp, state.coreHp + 6);
  setBossMusic(false);

  if (state.wave >= WIN_WAVE && !state.endless) { victory(); return; }

  nextWaveBtn.style.display = "block";
  waveProgressWrap.style.display = "none";
  showWavePreview();
  saveGame();
  refreshToolbar();
  refreshAbilityBar();
  updateHUD();
}

// ---------- Aparición de enemigos ----------
function makeEnemy(typeName, x, y, opts) {
  const t = ENEMY_TYPES[typeName];
  const d = diff();
  const mult = hpMultiplier(state.wave) * d.hp * ((opts && opts.hpMult) || 1);
  const e = {
    type: typeName,
    x, y,
    hp: t.hp * mult,
    maxHp: t.hp * mult,
    speed: t.speed * rand(0.9, 1.1) * d.speed,
    radius: t.radius,
    dmg: t.dmg,
    bounty: Math.round(t.bounty * d.bounty),
    score: t.score,
    color: t.color,
    shape: t.shape,
    splits: t.splits || 0,
    slowImmune: !!t.slowImmune,
    critImmune: !!t.critImmune,
    mega: !!t.mega,
    slowUntil: 0,
    slowFactor: 1,
    wobbleSeed: rand(0, TAU),
    hitFlash: 0,
    phased: false,
    spawnAnim: 0,
    elite: false,
  };
  if (typeName === "healer") e.nextHeal = state.time + 0.5;
  if (typeName === "digger") {
    e.burrowed = false;
    e.emerged = false;
    e.burrowAt = Math.sqrt(dist2(x, y, CX, CY)) * 0.65;
  }
  if (e.shape === "boss") e.nextPulse = state.time + 5;
  if (e.mega) e.nextSummon = state.time + 6;
  // Élites: variantes doradas más duras y valiosas
  if (opts && opts.canElite && state.wave >= 7 && e.shape !== "boss" && Math.random() < 0.12) {
    e.elite = true;
    e.hp *= 2.2; e.maxHp *= 2.2;
    e.bounty *= 2; e.score *= 2;
    e.radius *= 1.15;
  }
  return e;
}

function spawnEnemy(typeName) {
  const side = randInt(0, 3);
  const m = 40;
  let x, y;
  if (side === 0) { x = rand(0, W); y = -m; }
  else if (side === 1) { x = W + m; y = rand(0, H); }
  else if (side === 2) { x = rand(0, W); y = H + m; }
  else { x = -m; y = rand(0, H); }
  state.enemies.push(makeEnemy(typeName, x, y, { canElite: true }));
}

function spawnEnemyAt(typeName, x, y, opts) {
  state.enemies.push(makeEnemy(typeName, x, y, opts));
}

function spawnSplitChildren(parent) {
  for (let i = 0; i < parent.splits; i++) {
    const e = makeEnemy("mote", parent.x + rand(-14, 14), parent.y + rand(-14, 14), { hpMult: 0.6 });
    e.speed *= 1.25;
    e.radius *= 0.8;
    e.bounty = 4;
    e.score = 5;
    e.color = "#f0a8ff";
    e.spawnAnim = 1;
    state.enemies.push(e);
  }
}

// ---------- Torres ----------
const towerCost = (type) => Math.round(TOWER_TYPES[type].cost * metaCostMult());
const upgradeCost = (t) => Math.round(TOWER_TYPES[t.type].cost * 0.6 * (t.level + 1) * metaCostMult());
const vetMult = (t) => 1 + Math.min(0.2, Math.floor(t.kills / 10) * 0.02);

function towerStats(t) {
  const base = TOWER_TYPES[t.type];
  const lv = t.level;
  return {
    dmg: base.dmg * (1 + 0.35 * lv) * vetMult(t) * metaDmgMult(),
    range: base.range * (1 + 0.08 * lv),
    rate: (base.rate || 1) * Math.pow(0.88, lv),
  };
}

function canPlaceAt(x, y) {
  if (x < 20 || y < 20 || x > W - 20 || y > H - 20) return false;
  if (dist2(x, y, CX, CY) < CORE_EXCLUSION * CORE_EXCLUSION) return false;
  for (const t of state.towers) {
    if (dist2(x, y, t.x, t.y) < MIN_TOWER_GAP * MIN_TOWER_GAP) return false;
  }
  return true;
}

function placeTower(x, y) {
  const type = state.selectedType;
  const def = TOWER_TYPES[type];
  const cost = towerCost(type);
  if (state.wave < def.unlockWave) { sfx.error(); return; }
  if (state.energy < cost) {
    sfx.error();
    addText(x, y, "Energía insuficiente", "#ff5470", 13);
    shakeTowerBtn(type);
    return;
  }
  if (!canPlaceAt(x, y)) {
    sfx.error();
    addText(x, y, "No se puede construir aquí", "#ff5470", 13);
    return;
  }
  state.energy -= cost;
  state.towers.push({
    type, x, y, level: 0, cooldown: 0, angle: rand(0, TAU), flash: 0,
    invested: cost, kills: 0, priority: "core", buildAnim: 0,
    stunUntil: 0, beamTarget: null, beamTime: 0,
  });
  state.stats.towersBuilt++;
  if (state.stats.towersBuilt >= 10) unlockAchievement("builder");
  sfx.place();
  burst(x, y, def.color, 14, 3);
  refreshToolbar();
  updateHUD();
}

function tryUpgrade(t) {
  if (t.level >= MAX_LEVEL) {
    addText(t.x, t.y - 24, "Nivel máximo", "#9a92c9", 13);
    sfx.error();
    return;
  }
  const cost = upgradeCost(t);
  if (state.energy < cost) {
    addText(t.x, t.y - 24, `Necesitas ${cost} 💎`, "#ff5470", 13);
    sfx.error();
    return;
  }
  state.energy -= cost;
  t.invested += cost;
  t.level++;
  t.flash = 1;
  sfx.upgrade();
  burst(t.x, t.y, "#ffffff", 18, 4);
  addText(t.x, t.y - 24, `Nivel ${t.level + 1}`, TOWER_TYPES[t.type].color, 14);
  refreshToolbar();
  updateHUD();
}

function sellTower(t) {
  const refund = Math.round(t.invested * 0.6);
  state.energy += refund;
  state.towers = state.towers.filter(x => x !== t);
  state.hoverTower = null;
  hideTowerPopup();
  sfx.place();
  burst(t.x, t.y, "#9a92c9", 12, 3);
  addText(t.x, t.y - 20, `+${refund} 💎 vendida`, "#ffe08a", 13);
  refreshToolbar();
  updateHUD();
}

function cyclePriority(t) {
  const i = PRIORITIES.indexOf(t.priority);
  t.priority = PRIORITIES[(i + 1) % PRIORITIES.length];
  addText(t.x, t.y - 24, `Objetivo: ${PRIORITY_LABELS[t.priority]}`, "#8c78ff", 12);
}

function towerAt(x, y) {
  for (const t of state.towers) {
    if (dist2(x, y, t.x, t.y) < (TOWER_RADIUS + 8) * (TOWER_RADIUS + 8)) return t;
  }
  return null;
}

function targetable(e) {
  return !e.dead && !e.burrowed && !e.phased && e.spawnAnim > 0.25;
}

function pickTarget(t, range) {
  const r2 = range * range;
  let best = null, bestVal = Infinity;
  for (const e of state.enemies) {
    if (!targetable(e)) continue;
    if (dist2(t.x, t.y, e.x, e.y) > r2) continue;
    let val;
    if (t.priority === "strong") val = -e.hp;
    else if (t.priority === "weak") val = e.hp;
    else val = dist2(e.x, e.y, CX, CY);
    if (val < bestVal) { bestVal = val; best = e; }
  }
  return best;
}

// ---------- Daño ----------
function rollHit(e, base, source) {
  let dmg = base, crit = false;
  if (!e.critImmune && Math.random() < 0.1) {
    dmg *= 2;
    crit = true;
    state.stats.crits++;
    if (state.stats.crits >= 50) unlockAchievement("crit");
    addText(e.x, e.y - e.radius - 14, "¡CRIT!", "#ffc94a", 12);
    sfx.crit();
  }
  damageEnemy(e, dmg, source);
  return crit;
}

function damageEnemy(e, dmg, source) {
  if (e.dead || e.burrowed) return;
  e.hp -= dmg;
  state.stats.dmgDealt += dmg;
  e.hitFlash = 1;
  if (e.hp <= 0) {
    e.dead = true;
    state.energy += e.bounty;
    if (source) source.kills++;
    state.stats.kills++;
    meta.totalKills++;
    if (meta.totalKills >= 1000) unlockAchievement("kills");
    unlockAchievement("first");
    // Combo
    state.combo++;
    state.comboTimer = 2.2;
    const mult = 1 + Math.min(4, Math.floor(state.combo / 5));
    if (mult >= 5) unlockAchievement("combo");
    addScore(e.score * mult);
    if (state.combo % 5 === 0) addText(e.x, e.y - 26, `¡COMBO x${mult}!`, "#ffc94a", 15);
    updateComboHUD();
    sfx.death();
    burst(e.x, e.y, e.elite ? "#ffc94a" : e.color, e.shape === "boss" ? 46 : 14, e.shape === "boss" ? 6 : 3);
    addText(e.x, e.y - 10, `+${e.bounty}`, "#ffe08a", 13);
    if (e.splits) spawnSplitChildren(e);
    if (Math.random() < 0.15) dropGem(e.x, e.y);
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

function addScore(v) {
  state.score += Math.round(v * diff().score);
}

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

// ---------- Gemas ----------
function dropGem(x, y) {
  state.gems.push({ x, y, life: 6, seed: rand(0, TAU) });
}

// ---------- Habilidades ----------
function abilityUnlocked(a) { return state.wave >= a.unlock; }

function useAbility(id) {
  if (!state.running || state.gameOver || state.paused) return;
  const a = ABILITIES.find(x => x.id === id);
  if (!a || !abilityUnlocked(a) || state.cooldowns[id] > 0) { sfx.error(); return; }
  state.cooldowns[id] = a.cd * metaCdrMult();
  if (id === "pulse") firePulse();
  else if (id === "storm") fireStorm();
  else if (id === "shield") fireShield();
  else if (id === "over") fireOverdrive();
  refreshAbilityBar();
}

function firePulse() {
  state.shockwaves.push({ x: CX, y: CY, r: CORE_RADIUS, max: 300, life: 1 });
  sfx.pulse();
  state.shake = 10;
  const R = 300;
  for (const e of state.enemies) {
    if (e.burrowed) continue;
    const d2 = dist2(e.x, e.y, CX, CY);
    if (d2 < R * R) {
      damageEnemy(e, 35);
      const d = Math.sqrt(d2) || 1;
      const k = 170 * (1 - d / R) + 60;
      e.x += ((e.x - CX) / d) * k;
      e.y += ((e.y - CY) / d) * k;
    }
  }
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
      // Estela de caída
      for (let j = 0; j < 7; j++) {
        state.particles.push({
          x: x + j * 6 + rand(-3, 3), y: y - j * 26,
          vx: rand(-20, 20), vy: rand(80, 160),
          life: rand(0.2, 0.4), maxLife: 0.4, size: rand(1.5, 3.5), color: "#ffb36b",
        });
      }
      burst(x, y, "#ffb36b", 20, 5);
      state.shockwaves.push({ x, y, r: 6, max: 80, life: 0.6, color: "rgba(255,179,107,1)" });
      sfx.meteor();
      state.shake = Math.max(state.shake, 5);
      for (const e of state.enemies) {
        if (!e.dead && !e.burrowed && dist2(e.x, e.y, x, y) < 78 * 78) damageEnemy(e, 45);
      }
    });
  }
}

function fireShield() {
  state.shieldUntil = state.time + 4;
  sfx.shield();
  state.shockwaves.push({ x: CX, y: CY, r: CORE_RADIUS, max: CORE_EXCLUSION, life: 0.8, color: "rgba(110,231,216,1)" });
}

function fireOverdrive() {
  state.overUntil = state.time + 6;
  sfx.over();
  addText(CX, CY - CORE_RADIUS - 30, "🔥 ¡SOBRECARGA!", "#ff9a3c", 18);
  for (const t of state.towers) burst(t.x, t.y, "#ff9a3c", 6, 2);
}

// ---------- Partículas, textos, temporizadores ----------
function burst(x, y, color, n, speed) {
  for (let i = 0; i < n; i++) {
    if (state.particles.length > 420) return;
    const a = rand(0, TAU);
    const s = rand(30, 90) * speed / 3;
    state.particles.push({
      x, y,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: rand(0.35, 0.8), maxLife: 0.8,
      size: rand(1.5, 4), color,
    });
  }
}
function addText(x, y, str, color, size) {
  state.texts.push({ x, y, str, color, size: size || 14, life: 1.2 });
}
function addTimer(delay, fn) {
  state.timers.push({ t: state.time + delay, fn });
}

// ---------- Guardado de partida ----------
function saveGame() {
  const data = {
    v: 2,
    wave: state.wave,
    energy: state.energy,
    score: state.score,
    coreHp: state.coreHp,
    coreMaxHp: state.coreMaxHp,
    difficulty: state.difficulty,
    endless: state.endless,
    stats: state.stats,
    combo: 0,
    towers: state.towers.map(t => ({
      type: t.type, dx: t.x - CX, dy: t.y - CY,
      level: t.level, kills: t.kills, invested: t.invested, priority: t.priority,
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
    return d && d.v === 2 ? d : null;
  } catch (e) { return null; }
}

function loadGame() {
  const d = getSave();
  if (!d) return false;
  resetGame(d.difficulty);
  state.wave = d.wave;
  state.energy = d.energy;
  state.score = d.score;
  state.coreMaxHp = d.coreMaxHp;
  state.coreHp = d.coreHp;
  state.endless = !!d.endless;
  state.stats = { ...freshStats(), ...(d.stats || {}) };
  state.towers = (d.towers || []).map(t => ({
    type: t.type,
    x: clamp(CX + t.dx, 20, W - 20),
    y: clamp(CY + t.dy, 20, H - 20),
    level: t.level, kills: t.kills || 0, invested: t.invested,
    priority: t.priority || "core",
    cooldown: 0, angle: rand(0, TAU), flash: 0, buildAnim: 1,
    stunUntil: 0, beamTarget: null, beamTime: 0,
  }));
  state.autoStartTimer = 25;
  showBanner(`OLEADA ${state.wave} SUPERADA`, "Partida recuperada — prepárate para la siguiente");
  showWavePreview();
  refreshToolbar();
  refreshAbilityBar();
  updateHUD();
  return true;
}

// ---------- Bucle principal ----------
let lastTime = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  updateFireflies(dt);
  if (state.running && !state.gameOver && !state.paused) update(dt);
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

  // Temporizadores
  if (state.timers.length) {
    const due = state.timers.filter(t => t.t <= state.time);
    state.timers = state.timers.filter(t => t.t > state.time);
    for (const t of due) t.fn();
  }

  // Recargas
  let cdChanged = false;
  for (const a of ABILITIES) {
    if (state.cooldowns[a.id] > 0) {
      state.cooldowns[a.id] = Math.max(0, state.cooldowns[a.id] - dt);
      cdChanged = true;
    }
  }
  if (cdChanged) refreshAbilityBar();

  // Combo
  if (state.comboTimer > 0) {
    state.comboTimer -= dt;
    if (state.comboTimer <= 0) { state.combo = 0; updateComboHUD(); }
  }

  // Fase de construcción
  if (state.phase === "build" && state.wave > 0) {
    state.autoStartTimer -= dt;
    nextWaveBtn.textContent = `▶ Siguiente oleada (${Math.ceil(Math.max(0, state.autoStartTimer))}s)`;
    if (state.autoStartTimer <= 0) startWave(false);
  }

  // Aparición
  if (state.phase === "wave" && state.spawnQueue.length > 0) {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnEnemy(state.spawnQueue.pop());
      const base = Math.max(0.18, 1.1 - state.wave * 0.05);
      state.spawnTimer = base * rand(0.7, 1.3);
    }
  }

  const shieldActive = state.time < state.shieldUntil;
  const overActive = state.time < state.overUntil;

  // Enemigos
  for (const e of state.enemies) {
    if (e.dead) continue;
    if (e.hitFlash > 0) e.hitFlash -= dt * 6;
    if (e.spawnAnim < 1) {
      e.spawnAnim = Math.min(1, e.spawnAnim + dt * 1.8);
      if (e.spawnAnim < 0.35) continue; // emergiendo del portal
    }
    if (e.shape === "ghost") e.phased = Math.sin(state.time * 1.6 + e.wobbleSeed) > 0.15;

    const dx = CX - e.x, dy = CY - e.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;

    // Excavador: se entierra a mitad de camino y emerge cerca del núcleo
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

    // Sanador: regenera a las sombras cercanas
    if (e.type === "healer" && state.time > e.nextHeal) {
      e.nextHeal = state.time + 0.5;
      for (const o of state.enemies) {
        if (o !== e && !o.dead && o.hp < o.maxHp && dist2(e.x, e.y, o.x, o.y) < 90 * 90) {
          o.hp = Math.min(o.maxHp, o.hp + 5);
          if (state.particles.length < 420) {
            state.particles.push({
              x: o.x + rand(-8, 8), y: o.y + rand(-4, 4),
              vx: 0, vy: -30, life: 0.5, maxLife: 0.5, size: 2, color: "#7dffa8",
            });
          }
        }
      }
    }

    // Jefes: pulso oscuro que aturde torres
    if (e.shape === "boss" && state.time > e.nextPulse) {
      e.nextPulse = state.time + 6;
      state.shockwaves.push({ x: e.x, y: e.y, r: 10, max: 170, life: 0.8, color: "rgba(120,40,120,1)" });
      sfx.stun();
      let stunned = 0;
      for (const t of state.towers) {
        if (dist2(t.x, t.y, e.x, e.y) < 170 * 170) { t.stunUntil = state.time + 1.6; stunned++; }
      }
      if (stunned) addText(e.x, e.y - e.radius - 16, "¡Torres aturdidas!", "#c084fc", 13);
    }
    if (e.mega && state.time > e.nextSummon) {
      e.nextSummon = state.time + 7;
      for (let i = 0; i < 3; i++) spawnEnemyAt("mote", e.x + rand(-30, 30), e.y + rand(-30, 30), {});
      addText(e.x, e.y - e.radius - 16, "¡Invoca esbirros!", "#ff8ac2", 13);
    }

    const slowed = state.time < e.slowUntil && !e.slowImmune ? e.slowFactor : 1;
    const wob = Math.sin(state.time * 3 + e.wobbleSeed) * 0.35;
    const ang = Math.atan2(dy, dx) + wob * (e.type === "swift" ? 1.4 : 0.6);
    const v = e.speed * slowed * (e.burrowed ? 2.2 : 1);
    e.x += Math.cos(ang) * v * dt;
    e.y += Math.sin(ang) * v * dt;

    if (d < CORE_RADIUS + e.radius) {
      if (shieldActive) {
        // El escudo repele y castiga
        const k = 180;
        e.x += ((e.x - CX) / d) * k;
        e.y += ((e.y - CY) / d) * k;
        damageEnemy(e, 25);
        burst(e.x, e.y, "#6ee7d8", 8, 3);
      } else {
        e.dead = true;
        state.coreHp -= e.dmg;
        state.waveDamageTaken += e.dmg;
        state.corePulse = 1;
        state.shake = Math.max(state.shake, 8);
        sfx.coreHit();
        burst(e.x, e.y, "#ff5470", 18, 4);
        addText(CX, CY - CORE_RADIUS - 12, `-${e.dmg}`, "#ff5470", 16);
        updateHUD();
        if (state.coreHp <= 0) { gameOver(); return; }
      }
    }
  }
  state.enemies = state.enemies.filter(e => !e.dead);

  // Torres
  for (const t of state.towers) {
    if (t.flash > 0) t.flash -= dt * 3;
    if (t.buildAnim < 1) t.buildAnim = Math.min(1, t.buildAnim + dt * 2.5);
    const stunned = state.time < t.stunUntil;
    const def = TOWER_TYPES[t.type];
    const st = towerStats(t);

    if (def.beam) {
      // Diamante: láser continuo con daño creciente
      let target = t.beamTarget;
      if (!target || target.dead || !targetable(target) || dist2(t.x, t.y, target.x, target.y) > st.range * st.range) {
        target = pickTarget(t, st.range);
        t.beamTime = 0;
      }
      t.beamTarget = stunned ? null : target;
      if (t.beamTarget) {
        t.angle = Math.atan2(t.beamTarget.y - t.y, t.beamTarget.x - t.x);
        t.beamTime += dt;
        const ramp = 1 + Math.min(1.5, t.beamTime * 0.5);
        const over = overActive ? 1.6 : 1;
        damageEnemy(t.beamTarget, st.dmg * ramp * over * dt, t);
      }
      continue;
    }

    t.cooldown -= dt * (overActive ? 2 : 1);
    if (stunned) continue;
    const target = pickTarget(t, st.range);
    if (!target) continue;
    t.angle = Math.atan2(target.y - t.y, target.x - t.x);
    if (t.cooldown > 0) continue;
    t.cooldown = st.rate;

    if (def.chain) {
      // Amatista: rayo encadenado
      const pts = [{ x: t.x, y: t.y }];
      const hitSet = new Set();
      let current = target;
      let dmg = st.dmg;
      for (let i = 0; i < def.chain && current; i++) {
        pts.push({ x: current.x, y: current.y });
        hitSet.add(current);
        rollHit(current, dmg, t);
        dmg *= 0.72;
        let next = null, bd = def.chainRange * def.chainRange;
        for (const e of state.enemies) {
          if (!targetable(e) || hitSet.has(e)) continue;
          const d2 = dist2(current.x, current.y, e.x, e.y);
          if (d2 < bd) { bd = d2; next = e; }
        }
        current = next;
      }
      state.beams.push({ pts, color: def.color, life: 0.18, maxLife: 0.18 });
      sfx.zap();
    } else if (def.pierce) {
      // Ámbar: disparo rectilíneo perforante
      const d = Math.sqrt(dist2(t.x, t.y, target.x, target.y)) || 1;
      state.projectiles.push({
        kind: "line",
        x: t.x, y: t.y,
        vx: ((target.x - t.x) / d) * def.projSpeed,
        vy: ((target.y - t.y) / d) * def.projSpeed,
        dmg: st.dmg, color: def.color, source: t,
        pierce: def.pierce, hitSet: new Set(), trail: [],
      });
      sfx.shoot();
    } else {
      state.projectiles.push({
        kind: "homing",
        x: t.x, y: t.y, target,
        speed: def.projSpeed, dmg: st.dmg, color: def.color, source: t,
        splash: def.splash || 0,
        slowFactor: def.slowFactor || 0, slowTime: def.slowTime || 0,
        trail: [],
      });
      sfx.shoot();
    }
  }

  // Proyectiles
  for (const p of state.projectiles) {
    if (p.kind === "line") {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 6) p.trail.shift();
      if (p.x < -30 || p.y < -30 || p.x > W + 30 || p.y > H + 30) { p.dead = true; continue; }
      for (const e of state.enemies) {
        if (!targetable(e) || p.hitSet.has(e)) continue;
        if (dist2(e.x, e.y, p.x, p.y) < (e.radius + 6) * (e.radius + 6)) {
          p.hitSet.add(e);
          rollHit(e, p.dmg, p.source);
          burst(p.x, p.y, p.color, 5, 2);
          sfx.hit();
          p.pierce--;
          if (p.pierce <= 0) { p.dead = true; break; }
        }
      }
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
        for (const e of state.enemies) {
          if (targetable(e) && dist2(e.x, e.y, p.x, p.y) < p.splash * p.splash) rollHit(e, p.dmg, p.source);
        }
      } else {
        burst(p.x, p.y, p.color, 5, 2);
        rollHit(tgt, p.dmg, p.source);
      }
      if (p.slowFactor && !tgt.dead && !tgt.slowImmune) {
        tgt.slowUntil = state.time + p.slowTime;
        tgt.slowFactor = p.slowFactor;
      }
    }
  }
  state.projectiles = state.projectiles.filter(p => !p.dead);

  // Gemas: se recogen con el cursor
  for (const g of state.gems) {
    g.life -= dt;
    if (dist2(g.x, g.y, state.mouseX, state.mouseY) < 42 * 42) {
      g.dead = true;
      state.energy += 5;
      state.stats.gems++;
      if (state.stats.gems >= 20) unlockAchievement("gems");
      sfx.coin();
      addText(g.x, g.y - 10, "+5 💎", "#6ee7d8", 12);
      updateHUD();
    }
  }
  state.gems = state.gems.filter(g => !g.dead && g.life > 0);

  // Partículas / textos / ondas / rayos
  for (const pt of state.particles) {
    pt.life -= dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.96; pt.vy *= 0.96;
  }
  state.particles = state.particles.filter(p => p.life > 0);

  for (const tx of state.texts) { tx.life -= dt; tx.y -= 26 * dt; }
  state.texts = state.texts.filter(t => t.life > 0);

  for (const sw of state.shockwaves) {
    sw.life -= dt * 1.6;
    sw.r = lerp(sw.r, sw.max, dt * 7);
  }
  state.shockwaves = state.shockwaves.filter(s => s.life > 0);

  for (const bm of state.beams) bm.life -= dt;
  state.beams = state.beams.filter(b => b.life > 0);

  // Progreso de oleada
  if (state.phase === "wave") {
    const remaining = state.spawnQueue.length + state.enemies.length;
    const frac = state.waveTotal > 0 ? clamp(remaining / state.waveTotal, 0, 1) : 0;
    waveProgressBar.style.width = `${frac * 100}%`;
    waveProgressLabel.textContent = `${remaining} sombras restantes`;
    if (state.spawnQueue.length === 0 && state.enemies.length === 0) endWave();
  }
}

// ---------- Final de partida ----------
function fragmentsEarned() {
  return state.wave * 3 + Math.floor(state.score / 250);
}

function buildStatsHTML() {
  const s = state.stats;
  const items = [
    [state.wave, "Oleadas"],
    [state.score, "Puntuación"],
    [s.kills, "Bajas"],
    [Math.round(s.dmgDealt), "Daño infligido"],
    [s.towersBuilt, "Torres construidas"],
    [s.crits, "Críticos"],
    [s.gems, "Gemas recogidas"],
    [s.perfectWaves, "Oleadas perfectas"],
  ];
  return items.map(([n, l]) => `<div class="sg"><div class="n">${n}</div><div class="l">${l}</div></div>`).join("");
}

function finishRun() {
  const earned = fragmentsEarned();
  meta.fragments += earned;
  if (state.score > meta.best) meta.best = state.score;
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
  const earned = finishRun();
  setTimeout(() => {
    document.getElementById("final-stats").innerHTML = buildStatsHTML();
    document.getElementById("final-frags").textContent = `+${earned} 💠 fragmentos de geoda · Mejor puntuación: ${meta.best}`;
    document.getElementById("gameover").classList.remove("hidden");
    nextWaveBtn.style.display = "none";
    wavePreview.style.display = "none";
    waveProgressWrap.style.display = "none";
  }, 900);
}

function victory() {
  state.running = false; // congela la partida bajo la pantalla de triunfo
  unlockAchievement("legend");
  const earned = finishRun();
  nextWaveBtn.style.display = "none";
  wavePreview.style.display = "none";
  waveProgressWrap.style.display = "none";
  document.getElementById("victory-stats").innerHTML = buildStatsHTML();
  document.getElementById("victory-frags").textContent = `+${earned} 💠 fragmentos de geoda`;
  document.getElementById("victory").classList.remove("hidden");
  sfx.achieve();
  burst(CX, CY, "#ffc94a", 80, 8);
}

// ---------- Render ----------
function render() {
  ctx.save();
  if (state.shake > 0.5) {
    ctx.translate(rand(-state.shake, state.shake) * 0.4, rand(-state.shake, state.shake) * 0.4);
  }
  if (backdrop) ctx.drawImage(backdrop, 0, 0);
  else { ctx.fillStyle = "#0b0a14"; ctx.fillRect(0, 0, W, H); }

  // La caverna cambia de tono con las oleadas
  if (state.wave > 0) {
    ctx.fillStyle = `hsla(${(250 + state.wave * 7) % 360}, 60%, 22%, 0.07)`;
    ctx.fillRect(0, 0, W, H);
  }

  // Luciérnagas ambientales
  for (const f of fireflies) {
    const tw = 0.3 + Math.abs(Math.sin(performance.now() / 900 + f.seed)) * 0.6;
    ctx.globalAlpha = tw * 0.55;
    ctx.fillStyle = `hsl(${f.hue}, 80%, 70%)`;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.size, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  drawCore();
  for (const t of state.towers) drawTower(t);
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

function drawCore() {
  const pulse = 1 + Math.sin(state.time * 2.2) * 0.05 + state.corePulse * 0.18;
  const r = CORE_RADIUS * pulse;
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
  ctx.arc(CX, CY, CORE_EXCLUSION, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);

  const facets = 7;
  for (let layer = 0; layer < 2; layer++) {
    const rr = r * (layer === 0 ? 1 : 0.62);
    ctx.beginPath();
    for (let i = 0; i <= facets; i++) {
      const a = (i / facets) * TAU + state.time * (layer === 0 ? 0.25 : -0.4);
      const jag = 1 + Math.sin(i * 3.7) * 0.12;
      const px = CX + Math.cos(a) * rr * jag;
      const py = CY + Math.sin(a) * rr * jag;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
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

  // Grietas según el daño recibido
  if (hpFrac < 0.9) {
    ctx.strokeStyle = `rgba(10,8,20,${(1 - hpFrac) * 0.85})`;
    ctx.lineWidth = 1.6;
    const visible = Math.ceil((1 - hpFrac) * crackSegs.length);
    for (let i = 0; i < visible; i++) {
      const pts = crackSegs[i];
      ctx.beginPath();
      for (let j = 0; j < pts.length; j++) {
        const px = CX + pts[j][0] * r * 0.95;
        const py = CY + pts[j][1] * r * 0.95;
        if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }

  // Burbuja del escudo
  if (state.time < state.shieldUntil) {
    const remain = state.shieldUntil - state.time;
    ctx.strokeStyle = `rgba(110,231,216,${0.5 + Math.sin(state.time * 8) * 0.25})`;
    ctx.fillStyle = "rgba(110,231,216,0.07)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(CX, CY, CORE_EXCLUSION * 0.92 + Math.sin(state.time * 5) * 3, 0, TAU);
    ctx.fill();
    ctx.stroke();
    if (remain < 1.2) ctx.globalAlpha = 1; // parpadeo final manejado por el seno
  }
}

function drawTower(t) {
  const def = TOWER_TYPES[t.type];
  const st = towerStats(t);
  const hover = state.hoverTower === t;
  const scale = 0.3 + t.buildAnim * 0.7;
  const stunned = state.time < t.stunUntil;
  const overActive = state.time < state.overUntil;

  if (hover) {
    ctx.fillStyle = def.glow + "0.06)";
    ctx.strokeStyle = def.glow + "0.35)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(t.x, t.y, st.range, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  ctx.fillStyle = stunned ? "rgba(60,30,70,0.9)" : "rgba(20,18,40,0.9)";
  ctx.strokeStyle = stunned ? "rgba(192,132,252,0.7)" : def.glow + "0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(t.x, t.y, TOWER_RADIUS * scale, 0, TAU);
  ctx.fill();
  ctx.stroke();

  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.rotate(t.angle);
  ctx.scale(scale, scale);
  const glow = 0.6 + t.flash + (overActive ? 0.3 : 0);
  ctx.shadowColor = overActive ? "#ff9a3c" : def.color;
  ctx.shadowBlur = 10 + t.flash * 20 + (overActive ? 8 : 0);
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

  for (let i = 0; i < t.level; i++) {
    const a = -TAU / 4 + (i - (t.level - 1) / 2) * 0.45;
    ctx.fillStyle = "#ffe08a";
    ctx.beginPath();
    ctx.arc(t.x + Math.cos(a) * (TOWER_RADIUS + 6), t.y + Math.sin(a) * (TOWER_RADIUS + 6), 2.5, 0, TAU);
    ctx.fill();
  }
  // Corona de veteranía
  if (vetMult(t) > 1.1) {
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("★", t.x, t.y + TOWER_RADIUS + 12);
  }
}

function drawDiamondBeams() {
  for (const t of state.towers) {
    if (!TOWER_TYPES[t.type].beam || !t.beamTarget || t.beamTarget.dead) continue;
    const e = t.beamTarget;
    const ramp = Math.min(1.5, t.beamTime * 0.5);
    const w = 1.5 + ramp * 2.5;
    const grad = ctx.createLinearGradient(t.x, t.y, e.x, e.y);
    grad.addColorStop(0, "rgba(232,244,255,0.9)");
    grad.addColorStop(1, "rgba(160,220,255,0.55)");
    ctx.strokeStyle = grad;
    ctx.lineWidth = w + Math.sin(state.time * 30) * 0.8;
    ctx.shadowColor = "#bfe4ff";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(t.x, t.y);
    ctx.lineTo(e.x, e.y);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(232,244,255,0.9)";
    ctx.beginPath();
    ctx.arc(e.x, e.y, 3 + ramp * 3, 0, TAU);
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
    // zigzag de relámpago entre puntos
    if (i === 0) ctx.moveTo(p.x, p.y);
    else {
      const prev = bm.pts[i - 1];
      const mx = (prev.x + p.x) / 2 + rand(-8, 8);
      const my = (prev.y + p.y) / 2 + rand(-8, 8);
      ctx.lineTo(mx, my);
      ctx.lineTo(p.x, p.y);
    }
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}

function drawPlacementPreview() {
  if (!state.running || state.gameOver || state.hoverTower) return;
  if (state.mouseY > H - 130 && Math.abs(state.mouseX - W / 2) < 400) return;
  const def = TOWER_TYPES[state.selectedType];
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
  ctx.arc(state.mouseX, state.mouseY, TOWER_RADIUS, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawEnemy(e) {
  const flash = Math.max(0, e.hitFlash);
  const slowed = state.time < e.slowUntil && !e.slowImmune;
  ctx.save();
  ctx.translate(e.x, e.y);

  // Portal de aparición
  if (e.spawnAnim < 1) {
    ctx.strokeStyle = `rgba(140,120,255,${(1 - e.spawnAnim) * 0.8})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, e.radius + 10 + (1 - e.spawnAnim) * 14, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = e.spawnAnim;
    ctx.scale(e.spawnAnim, e.spawnAnim);
  }

  // Excavador bajo tierra: solo un montículo
  if (e.burrowed) {
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = "#5c4a32";
    ctx.beginPath();
    ctx.ellipse(0, 4, e.radius, e.radius * 0.4, 0, 0, TAU);
    ctx.fill();
    if (state.particles.length < 420 && Math.random() < 0.3) {
      state.particles.push({
        x: e.x + rand(-8, 8), y: e.y + rand(-2, 6),
        vx: rand(-15, 15), vy: rand(-40, -10),
        life: 0.4, maxLife: 0.4, size: rand(1, 2.5), color: "#8a6f4d",
      });
    }
    ctx.restore();
    return;
  }

  ctx.shadowColor = e.elite ? "#ffc94a" : e.color;
  ctx.shadowBlur = e.shape === "boss" ? 26 : e.elite ? 16 : 10;
  ctx.fillStyle = flash > 0.4 ? "#ffffff" : e.color;

  const r = e.radius;
  const wob = Math.sin(state.time * 6 + e.wobbleSeed);

  if (e.shape === "tri") {
    const a = Math.atan2(CY - e.y, CX - e.x);
    ctx.rotate(a);
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
      const px = Math.cos(a) * r, py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
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
      if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.rotate(-state.time * 0.6);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#0b3a22";
    ctx.fillRect(-r * 0.5, -r * 0.14, r, r * 0.28);
    ctx.fillRect(-r * 0.14, -r * 0.5, r * 0.28, r);
    // Aura de curación
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
      const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
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
  } else if (e.shape === "ghost") {
    ctx.globalAlpha = (e.phased ? 0.28 : 0.92) * ctx.globalAlpha;
    ctx.beginPath();
    ctx.arc(0, -r * 0.15, r, Math.PI, 0);
    for (let i = 0; i <= 4; i++) {
      const px = r - (i / 4) * 2 * r;
      const py = r * 0.55 + Math.sin(state.time * 7 + i * 2 + e.wobbleSeed) * r * 0.18;
      ctx.lineTo(px, py);
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
      const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  if (slowed) {
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(74,217,232,0.8)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, r + 4, 0, TAU);
    ctx.stroke();
  }
  if (e.elite) {
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(255,201,74,${0.6 + Math.sin(state.time * 4) * 0.3})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r + 6, 0, TAU);
    ctx.stroke();
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
  ctx.moveTo(0, -7);
  ctx.lineTo(5, 0);
  ctx.lineTo(0, 7);
  ctx.lineTo(-5, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.beginPath();
  ctx.moveTo(0, -4);
  ctx.lineTo(2.5, 0);
  ctx.lineTo(0, 4);
  ctx.lineTo(-2.5, 0);
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
  bannerTimeout = setTimeout(() => banner.classList.remove("show"), 2200);
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
  TOWER_ORDER.forEach((type, i) => {
    const def = TOWER_TYPES[type];
    const btn = document.createElement("div");
    btn.className = "tower-btn";
    btn.dataset.type = type;
    btn.innerHTML = `<span class="key">${i + 1}</span><div class="gem" style="color:${def.color}">${def.gem}</div><div class="name">${def.name}</div><div class="cost"></div>`;
    btn.addEventListener("click", () => { ensureAudio(); selectTower(type); });
    btn.addEventListener("mouseenter", (ev) => {
      const extra = def.beam ? `DPS ${def.dmg} · Alcance ${def.range}`
        : def.chain ? `Daño ${def.dmg} ×${def.chain} saltos · Alcance ${def.range}`
        : `Daño ${def.dmg} · Alcance ${def.range} · Cadencia ${def.rate}s`;
      tooltip.innerHTML = `<b>${def.name}</b> — ${towerCost(type)} 💎<div class="row">${def.desc}</div><div class="row">${extra}</div>`;
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

  for (const a of ABILITIES) {
    const btn = document.createElement("div");
    btn.className = "ability-btn";
    btn.innerHTML = `<span class="key">${a.key}</span><div class="gem">${a.icon}</div><div class="name">${a.name}</div><div class="cost"></div>`;
    btn.addEventListener("click", () => { ensureAudio(); useAbility(a.id); });
    btn.addEventListener("mouseenter", (ev) => {
      tooltip.innerHTML = `<b>${a.icon} ${a.name}</b><div class="row">${a.desc}</div><div class="row">Recarga: ${Math.round(a.cd * metaCdrMult())}s · Tecla ${a.key}</div>`;
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
  for (const type of TOWER_ORDER) {
    const btn = towerBtns[type];
    if (!btn) continue;
    const def = TOWER_TYPES[type];
    const locked = state.wave < def.unlockWave;
    btn.classList.toggle("locked", locked);
    btn.classList.toggle("selected", state.selectedType === type && !locked);
    btn.querySelector(".cost").textContent = locked ? `Oleada ${def.unlockWave}` : `${towerCost(type)} 💎`;
  }
  refreshTowerCosts();
}

function refreshTowerCosts() {
  for (const type of TOWER_ORDER) {
    const btn = towerBtns[type];
    if (!btn) continue;
    const locked = state.wave < TOWER_TYPES[type].unlockWave;
    btn.classList.toggle("cant", !locked && state.energy < towerCost(type));
  }
}

function refreshAbilityBar() {
  for (const a of ABILITIES) {
    const btn = abilityBtns[a.id];
    if (!btn) continue;
    const locked = !abilityUnlocked(a);
    const cd = state.cooldowns[a.id];
    btn.classList.toggle("locked", locked);
    btn.classList.toggle("cooling", !locked && cd > 0);
    btn.classList.toggle("ready", !locked && cd <= 0 && state.running && !state.gameOver);
    btn.querySelector(".cost").textContent = locked ? `Oleada ${a.unlock}` : cd > 0 ? `${Math.ceil(cd)}s` : "Lista";
  }
}

function shakeTowerBtn(type) {
  const btn = towerBtns[type];
  if (!btn) return;
  btn.classList.remove("shake");
  void btn.offsetWidth; // reinicia la animación
  btn.classList.add("shake");
}

function positionTooltip(mx, my) {
  const pad = 16;
  tooltip.style.left = `${Math.min(mx + pad, window.innerWidth - 260)}px`;
  tooltip.style.top = `${Math.max(8, my - 76)}px`;
}

function selectTower(type) {
  const def = TOWER_TYPES[type];
  if (state.wave < def.unlockWave) { sfx.error(); return; }
  state.selectedType = type;
  refreshToolbar();
}

function showWavePreview() {
  const next = state.wave + 1;
  const c = countComposition(next);
  const parts = Object.keys(c).map(type =>
    `<span class="ico" style="color:${ENEMY_TYPES[type].color}">${ENEMY_ICONS[type]}</span>×${c[type]}`
  );
  wavePreview.innerHTML = `Oleada ${next}: &nbsp;${parts.join(" &nbsp;")}`;
  wavePreview.style.display = "block";
}

// ---------- Popup de torre (táctil) ----------
let popupTower = null;
function showTowerPopup(t) {
  popupTower = t;
  const upCost = t.level >= MAX_LEVEL ? null : upgradeCost(t);
  towerPopup.innerHTML = "";
  const mk = (label, fn, disabled) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.disabled = !!disabled;
    b.addEventListener("click", (ev) => { ev.stopPropagation(); fn(); });
    towerPopup.appendChild(b);
    return b;
  };
  mk(upCost === null ? "Nivel máximo" : `⬆ Mejorar (${upCost} 💎)`, () => { tryUpgrade(t); showTowerPopup(t); }, upCost === null || state.energy < upCost);
  mk(`🎯 ${PRIORITY_LABELS[t.priority]}`, () => { cyclePriority(t); showTowerPopup(t); });
  mk(`🗑 Vender (+${Math.round(t.invested * 0.6)} 💎)`, () => sellTower(t));
  towerPopup.style.display = "block";
  towerPopup.style.left = `${clamp(t.x + 24, 8, W - 190)}px`;
  towerPopup.style.top = `${clamp(t.y - 40, 8, H - 150)}px`;
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
    const t = state.hoverTower;
    const def = TOWER_TYPES[t.type];
    const st = towerStats(t);
    const up = t.level >= MAX_LEVEL ? "Nivel máximo" : `Clic: mejorar por ${upgradeCost(t)} 💎`;
    const vet = vetMult(t) > 1 ? ` · ★ +${Math.round((vetMult(t) - 1) * 100)}%` : "";
    tooltip.innerHTML = `<b>${def.name}</b> · Nivel ${t.level + 1} · ${t.kills} bajas${vet}` +
      `<div class="row">Daño ${st.dmg.toFixed(0)} · Alcance ${st.range.toFixed(0)} · 🎯 ${PRIORITY_LABELS[t.priority]}</div>` +
      `<div class="row">${up}</div><div class="row">Clic dcho: vender +${Math.round(t.invested * 0.6)} 💎 · T: prioridad</div>`;
    tooltip.style.display = "block";
    positionTooltip(ev.clientX, ev.clientY);
    canvas.style.cursor = "pointer";
  } else {
    tooltip.style.display = "none";
    canvas.style.cursor = "crosshair";
  }
});

canvas.addEventListener("click", (ev) => {
  if (!state.running || state.gameOver || state.paused) return;
  ensureAudio();
  if (popupTower) { hideTowerPopup(); return; }
  const t = towerAt(ev.clientX, ev.clientY);
  if (t) {
    if (pointerCoarse) showTowerPopup(t);
    else tryUpgrade(t);
  } else {
    placeTower(ev.clientX, ev.clientY);
  }
});

canvas.addEventListener("contextmenu", (ev) => {
  ev.preventDefault();
  if (!state.running || state.gameOver || state.paused) return;
  const t = towerAt(ev.clientX, ev.clientY);
  if (t) sellTower(t);
});

// En táctil, el movimiento del dedo también recoge gemas
canvas.addEventListener("touchmove", (ev) => {
  if (ev.touches.length) {
    state.mouseX = ev.touches[0].clientX;
    state.mouseY = ev.touches[0].clientY;
  }
}, { passive: true });

function setPause(on) {
  if (!state.running || state.gameOver) return;
  state.paused = on;
  document.getElementById("paused").classList.toggle("hidden", !on);
}

function openHelp() {
  if (state.running && !state.gameOver && state.phase === "wave") setPause(true);
  document.getElementById("help").classList.remove("hidden");
}
function closeHelp() {
  document.getElementById("help").classList.add("hidden");
}

window.addEventListener("keydown", (ev) => {
  if (ev.code === "Space") {
    ev.preventDefault();
    ensureAudio();
    useAbility("pulse");
    return;
  }
  if (ev.code === "KeyH") {
    if (document.getElementById("help").classList.contains("hidden")) openHelp();
    else closeHelp();
    return;
  }
  if (ev.code === "KeyP" || ev.code === "Escape") {
    if (!document.getElementById("help").classList.contains("hidden")) { closeHelp(); return; }
    setPause(!state.paused);
    return;
  }
  if (ev.code === "KeyM") { ensureAudio(); toggleMute(); return; }
  if (ev.code === "Equal" || ev.code === "NumpadAdd") { ensureAudio(); changeVolume(0.1); return; }
  if (ev.code === "Minus" || ev.code === "NumpadSubtract") { ensureAudio(); changeVolume(-0.1); return; }
  if (state.paused) return;
  if (ev.code === "KeyQ") { ensureAudio(); useAbility("storm"); return; }
  if (ev.code === "KeyE") { ensureAudio(); useAbility("shield"); return; }
  if (ev.code === "KeyR") { ensureAudio(); useAbility("over"); return; }
  if (ev.code === "KeyT" && state.hoverTower) { cyclePriority(state.hoverTower); return; }
  const idx = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6"].indexOf(ev.code);
  if (idx >= 0) { selectTower(TOWER_ORDER[idx]); return; }
  if (ev.code === "Enter" && state.phase === "build" && state.running && !state.gameOver && state.wave > 0) {
    startWave(true);
  }
});

// Pausa automática al perder el foco
document.addEventListener("visibilitychange", () => {
  if (document.hidden && state.running && !state.gameOver && state.phase === "wave") setPause(true);
});
window.addEventListener("blur", () => {
  if (state.running && !state.gameOver && state.phase === "wave") setPause(true);
});

nextWaveBtn.addEventListener("click", () => { ensureAudio(); startWave(true); });
document.getElementById("help-btn").addEventListener("click", openHelp);
document.getElementById("help-close").addEventListener("click", closeHelp);
document.getElementById("resume-btn").addEventListener("click", () => setPause(false));
document.getElementById("restart-btn").addEventListener("click", () => {
  document.getElementById("paused").classList.add("hidden");
  state.paused = false;
  resetGame(state.difficulty);
});
document.getElementById("tomenu-btn").addEventListener("click", () => {
  document.getElementById("paused").classList.add("hidden");
  state.paused = false;
  goToMenu();
});

// ---------- Menú ----------
let menuDifficulty = "normal";

function buildDifficultyRow() {
  const row = document.getElementById("difficulty-row");
  row.innerHTML = "";
  for (const key in DIFFICULTIES) {
    const d = DIFFICULTIES[key];
    const btn = document.createElement("button");
    btn.className = "diff-btn" + (menuDifficulty === key ? " selected" : "");
    btn.style.color = menuDifficulty === key ? d.color : "";
    btn.textContent = d.name;
    btn.addEventListener("click", () => { menuDifficulty = key; buildDifficultyRow(); });
    row.appendChild(btn);
  }
}

function buildShop() {
  const grid = document.getElementById("shop-grid");
  grid.innerHTML = "";
  for (const item of SHOP) {
    const lv = meta.upgrades[item.id];
    const maxed = lv >= item.max;
    const cost = shopCost(lv);
    const el = document.createElement("div");
    el.className = "shop-item";
    el.innerHTML = `<span class="s-icon">${item.icon}</span>` +
      `<div class="s-body"><div class="s-name">${item.name} <span class="s-pips">${"◆".repeat(lv)}${"◇".repeat(item.max - lv)}</span></div>` +
      `<div class="s-desc">${item.desc}</div></div>`;
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
  const grid = document.getElementById("ach-grid");
  grid.innerHTML = "";
  let done = 0;
  for (const a of ACHIEVEMENTS) {
    const got = !!meta.ach[a.id];
    if (got) done++;
    const el = document.createElement("div");
    el.className = "ach " + (got ? "done" : "locked");
    el.textContent = a.icon;
    el.title = `${a.name} — ${a.desc} (+${a.frag} 💠)`;
    grid.appendChild(el);
  }
  document.getElementById("ach-title").textContent = `🏆 Logros ${done}/${ACHIEVEMENTS.length}`;
}

function updateMetaRow() {
  document.getElementById("meta-row").innerHTML =
    `Mejor puntuación: <b>${meta.best}</b> &nbsp;·&nbsp; Fragmentos: <b>${meta.fragments} 💠</b> &nbsp;·&nbsp; Bajas totales: <b>${meta.totalKills}</b>`;
  updateHUD();
}

function showMenu() {
  buildDifficultyRow();
  buildShop();
  buildAchGrid();
  updateMetaRow();
  document.getElementById("continue-btn").classList.toggle("hidden", !getSave());
  document.getElementById("menu").classList.remove("hidden");
}

function goToMenu() {
  state.running = false;
  state.gameOver = false;
  setBossMusic(false);
  nextWaveBtn.style.display = "none";
  wavePreview.style.display = "none";
  waveProgressWrap.style.display = "none";
  hideTowerPopup();
  document.getElementById("gameover").classList.add("hidden");
  document.getElementById("victory").classList.add("hidden");
  showMenu();
}

// ---------- Inicio / reinicio ----------
function resetGame(difficulty) {
  state.running = true;
  state.gameOver = false;
  state.paused = false;
  state.endless = false;
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
  state.towers = [];
  state.enemies = [];
  state.projectiles = [];
  state.particles = [];
  state.gems = [];
  state.beams = [];
  state.texts = [];
  state.shockwaves = [];
  state.timers = [];
  state.combo = 0;
  state.comboTimer = 0;
  state.time = 0;
  state.shake = 0;
  state.stats = freshStats();
  hideTowerPopup();
  document.getElementById("gameover").classList.add("hidden");
  document.getElementById("victory").classList.add("hidden");
  document.getElementById("menu").classList.add("hidden");
  document.getElementById("paused").classList.add("hidden");
  setBossMusic(false);
  updateComboHUD();
  refreshToolbar();
  refreshAbilityBar();
  updateHUD();
  showBanner("¡PREPÁRATE!", `Dificultad ${diff().name} — coloca tus torres y pulsa ▶`);
  nextWaveBtn.style.display = "block";
  nextWaveBtn.textContent = "▶ Primera oleada";
  showWavePreview();
  waveProgressWrap.style.display = "none";
}

document.getElementById("start-btn").addEventListener("click", () => { ensureAudio(); deleteSave(); resetGame(); });
document.getElementById("continue-btn").addEventListener("click", () => {
  ensureAudio();
  document.getElementById("menu").classList.add("hidden");
  if (!loadGame()) resetGame();
  else nextWaveBtn.style.display = "block";
});
document.getElementById("retry-btn").addEventListener("click", () => { ensureAudio(); resetGame(state.difficulty); });
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
  showBanner("♾ MODO INFINITO", "Las sombras no tienen fin… ¿y tu récord?");
  saveGame();
  updateHUD();
});
document.getElementById("vmenu-btn").addEventListener("click", goToMenu);

// ---------- Arranque ----------
resize();
buildToolbar();
showMenu();
updateHUD();
requestAnimationFrame(frame);
