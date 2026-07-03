/* =========================================================
   GEODA — Defiende el Núcleo
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

// ---------- Audio (WebAudio, generado al vuelo) ----------
let audioCtx = null;
let muted = localStorage.getItem("geoda_muted") === "1";
let musicGain = null;

function startMusic() {
  if (!audioCtx || musicGain) return;
  // Drone ambiental: dos osciladores desafinados + LFO de volumen
  musicGain = audioCtx.createGain();
  musicGain.gain.value = muted ? 0 : 0.035;
  musicGain.connect(audioCtx.destination);
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
}

function toggleMute() {
  muted = !muted;
  localStorage.setItem("geoda_muted", muted ? "1" : "0");
  if (musicGain) musicGain.gain.value = muted ? 0 : 0.035;
  if (!muted) beep(660, 0.1, "sine", 0.06, 100);
}

function ensureAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { audioCtx = null; }
  }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  startMusic();
}
function beep(freq, dur, type, vol, slide) {
  if (!audioCtx || muted) return;
  const t0 = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type || "sine";
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  gain.gain.setValueAtTime(vol || 0.08, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t0);
  osc.stop(t0 + dur);
}
const sfx = {
  shoot:   () => beep(rand(820, 940), 0.07, "square", 0.025, -300),
  hit:     () => beep(rand(180, 240), 0.08, "sawtooth", 0.03, -80),
  death:   () => beep(140, 0.22, "triangle", 0.06, -90),
  place:   () => beep(520, 0.15, "sine", 0.07, 240),
  upgrade: () => { beep(600, 0.1, "sine", 0.06, 200); setTimeout(() => beep(900, 0.12, "sine", 0.06, 250), 90); },
  error:   () => beep(160, 0.18, "square", 0.05, -40),
  coreHit: () => beep(90, 0.35, "sawtooth", 0.1, -40),
  pulse:   () => beep(70, 0.5, "sawtooth", 0.12, 160),
  wave:    () => { beep(330, 0.16, "sine", 0.07, 80); setTimeout(() => beep(440, 0.2, "sine", 0.07, 100), 140); },
  boss:    () => { beep(80, 0.6, "sawtooth", 0.12, -30); setTimeout(() => beep(60, 0.8, "sawtooth", 0.12, -20), 250); },
};

// ---------- Definición de torres ----------
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
    desc: "Congela: ralentiza a los enemigos 50%.", unlockWave: 0,
  },
  emerald: {
    name: "Esmeralda", gem: "🟢", color: "#52e5a5", glow: "rgba(82,229,165,",
    cost: 110, dmg: 12, rate: 0.9, range: 150, projSpeed: 380, splash: 62,
    desc: "Explosión con daño en área.", unlockWave: 2,
  },
  amber: {
    name: "Ámbar", gem: "🟡", color: "#ffc94a", glow: "rgba(255,201,74,",
    cost: 150, dmg: 42, rate: 1.7, range: 270, projSpeed: 760,
    desc: "Francotirador: mucho daño y alcance.", unlockWave: 4,
  },
};
const TOWER_ORDER = ["ruby", "sapphire", "emerald", "amber"];
const TOWER_RADIUS = 16;
const MIN_TOWER_GAP = 44;
const CORE_RADIUS = 34;
const CORE_EXCLUSION = 78;

// ---------- Definición de enemigos ----------
const ENEMY_TYPES = {
  mote: {
    hp: 22, speed: 52, radius: 11, dmg: 8, bounty: 8, score: 10,
    color: "#b06df0", shape: "blob",
  },
  swift: {
    hp: 12, speed: 105, radius: 8, dmg: 5, bounty: 10, score: 15,
    color: "#ff8ac2", shape: "tri",
  },
  brute: {
    hp: 95, speed: 30, radius: 18, dmg: 20, bounty: 24, score: 40,
    color: "#7a5cff", shape: "hex",
  },
  splitter: {
    hp: 40, speed: 44, radius: 14, dmg: 10, bounty: 14, score: 25,
    color: "#e06dd8", shape: "blob", splits: 2,
  },
  ghost: {
    hp: 34, speed: 62, radius: 12, dmg: 12, bounty: 18, score: 35,
    color: "#8fd4ff", shape: "ghost",
  },
  boss: {
    hp: 700, speed: 20, radius: 34, dmg: 60, bounty: 160, score: 400,
    color: "#ff4a6e", shape: "boss",
  },
};

// ---------- Estado del juego ----------
const state = {
  running: false,
  gameOver: false,
  paused: false,
  combo: 0,
  comboTimer: 0,
  energy: 0,
  score: 0,
  wave: 0,
  coreHp: 100,
  coreMaxHp: 100,
  corePulse: 0,          // animación de daño del núcleo
  selectedType: "ruby",
  phase: "build",        // build | wave
  autoStartTimer: 0,
  pulseCooldown: 0,
  pulseCooldownMax: 25,
  pulseAnim: 0,
  spawnQueue: [],
  spawnTimer: 0,
  towers: [],
  enemies: [],
  projectiles: [],
  particles: [],
  texts: [],
  shockwaves: [],
  time: 0,
  shake: 0,
  hoverTower: null,
  mouseX: 0, mouseY: 0,
  best: Number(localStorage.getItem("geoda_best") || 0),
};

// ---------- Fondo pre-renderizado ----------
let backdrop = null;
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

  // Cristales incrustados en la roca
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
  // Motas de polvo
  for (let i = 0; i < 90; i++) {
    b.globalAlpha = rand(0.04, 0.18);
    b.fillStyle = "#cfc6ff";
    b.beginPath();
    b.arc(Math.random() * W, Math.random() * H, rand(0.5, 1.6), 0, TAU);
    b.fill();
  }
  b.globalAlpha = 1;
}

// ---------- Oleadas ----------
function waveComposition(n) {
  const list = [];
  const push = (type, count) => { for (let i = 0; i < count; i++) list.push(type); };

  if (n % 5 === 0) {
    push("boss", Math.floor(n / 10) + 1);
    push("brute", Math.floor(n / 3));
    push("swift", 4 + n);
  } else {
    push("mote", 5 + Math.floor(n * 1.6));
    if (n >= 2) push("swift", 2 + n);
    if (n >= 3) push("splitter", Math.floor(n / 2));
    if (n >= 4) push("brute", Math.floor(n / 2));
    if (n >= 6) push("ghost", Math.floor(n / 3));
  }
  // Barajar
  for (let i = list.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function hpMultiplier(n) { return 1 + (n - 1) * 0.22; }

function startWave() {
  state.wave++;
  state.phase = "wave";
  state.spawnQueue = waveComposition(state.wave);
  state.spawnTimer = 0.8;
  nextWaveBtn.style.display = "none";
  const isBoss = state.wave % 5 === 0;
  showBanner(isBoss ? `⚠ OLEADA ${state.wave} ⚠` : `OLEADA ${state.wave}`,
    isBoss ? "¡Un jefe se acerca!" : "");
  (isBoss ? sfx.boss : sfx.wave)();
  refreshToolbar();
  updateHUD();
}

function endWave() {
  state.phase = "build";
  state.autoStartTimer = 18;
  const bonus = 30 + state.wave * 6;
  state.energy += bonus;
  state.score += state.wave * 20;
  addText(CX, CY - CORE_RADIUS - 26, `+${bonus} 💎 oleada superada`, "#52e5a5", 16);
  // Regenera un poco el núcleo
  state.coreHp = Math.min(state.coreMaxHp, state.coreHp + 6);
  nextWaveBtn.style.display = "block";
  refreshToolbar();
  updateHUD();
}

function spawnEnemy(typeName) {
  const t = ENEMY_TYPES[typeName];
  // Aparece justo fuera de un borde aleatorio
  const side = randInt(0, 3);
  let x, y;
  const m = 40;
  if (side === 0) { x = rand(0, W); y = -m; }
  else if (side === 1) { x = W + m; y = rand(0, H); }
  else if (side === 2) { x = rand(0, W); y = H + m; }
  else { x = -m; y = rand(0, H); }

  const mult = hpMultiplier(state.wave);
  state.enemies.push({
    type: typeName,
    x, y,
    hp: t.hp * mult,
    maxHp: t.hp * mult,
    speed: t.speed * rand(0.9, 1.1),
    radius: t.radius,
    dmg: t.dmg,
    bounty: t.bounty,
    score: t.score,
    color: t.color,
    shape: t.shape,
    splits: t.splits || 0,
    slowUntil: 0,
    slowFactor: 1,
    wobbleSeed: rand(0, TAU),
    hitFlash: 0,
    phased: false,
  });
}

function spawnSplitChildren(parent) {
  for (let i = 0; i < parent.splits; i++) {
    const t = ENEMY_TYPES.mote;
    const mult = hpMultiplier(state.wave) * 0.6;
    state.enemies.push({
      type: "mote",
      x: parent.x + rand(-14, 14),
      y: parent.y + rand(-14, 14),
      hp: t.hp * mult,
      maxHp: t.hp * mult,
      speed: t.speed * 1.25,
      radius: t.radius * 0.8,
      dmg: t.dmg,
      bounty: 4,
      score: 5,
      color: "#f0a8ff",
      shape: "blob",
      splits: 0,
      slowUntil: 0,
      slowFactor: 1,
      wobbleSeed: rand(0, TAU),
      hitFlash: 0,
    });
  }
}

// ---------- Torres ----------
function towerCost(type) { return TOWER_TYPES[type].cost; }
function upgradeCost(tower) { return Math.round(TOWER_TYPES[tower.type].cost * 0.7 * (tower.level + 1)); }

function towerStats(tower) {
  const base = TOWER_TYPES[tower.type];
  const lv = tower.level;
  return {
    dmg: base.dmg * (1 + 0.4 * lv),
    range: base.range * (1 + 0.09 * lv),
    rate: base.rate * Math.pow(0.86, lv),
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
  if (state.wave < def.unlockWave) { sfx.error(); return; }
  if (state.energy < def.cost) {
    sfx.error();
    addText(x, y, "Energía insuficiente", "#ff5470", 13);
    return;
  }
  if (!canPlaceAt(x, y)) {
    sfx.error();
    addText(x, y, "No se puede construir aquí", "#ff5470", 13);
    return;
  }
  state.energy -= def.cost;
  state.towers.push({ type, x, y, level: 0, cooldown: 0, angle: rand(0, TAU), flash: 0, invested: def.cost });
  sfx.place();
  burst(x, y, def.color, 14, 3);
  refreshToolbar();
  updateHUD();
}

function tryUpgrade(tower) {
  if (tower.level >= 3) {
    addText(tower.x, tower.y - 24, "Nivel máximo", "#9a92c9", 13);
    sfx.error();
    return;
  }
  const cost = upgradeCost(tower);
  if (state.energy < cost) {
    addText(tower.x, tower.y - 24, `Necesitas ${cost} 💎`, "#ff5470", 13);
    sfx.error();
    return;
  }
  state.energy -= cost;
  tower.invested += cost;
  tower.level++;
  tower.flash = 1;
  sfx.upgrade();
  burst(tower.x, tower.y, "#ffffff", 18, 4);
  addText(tower.x, tower.y - 24, `Nivel ${tower.level + 1}`, TOWER_TYPES[tower.type].color, 14);
  refreshToolbar();
  updateHUD();
}

function sellTower(tower) {
  const refund = Math.round(tower.invested * 0.6);
  state.energy += refund;
  state.towers = state.towers.filter(t => t !== tower);
  state.hoverTower = null;
  sfx.place();
  burst(tower.x, tower.y, "#9a92c9", 12, 3);
  addText(tower.x, tower.y - 20, `+${refund} 💎 vendida`, "#ffe08a", 13);
  refreshToolbar();
  updateHUD();
}

function towerAt(x, y) {
  for (const t of state.towers) {
    if (dist2(x, y, t.x, t.y) < (TOWER_RADIUS + 8) * (TOWER_RADIUS + 8)) return t;
  }
  return null;
}

// ---------- Pulso de choque ----------
function firePulse() {
  if (state.pulseCooldown > 0 || state.gameOver || !state.running || state.paused) return;
  state.pulseCooldown = state.pulseCooldownMax;
  state.pulseAnim = 0.001;
  state.shockwaves.push({ x: CX, y: CY, r: CORE_RADIUS, max: 300, life: 1 });
  sfx.pulse();
  state.shake = 10;
  const R = 300;
  for (const e of state.enemies) {
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

// ---------- Daño ----------
function damageEnemy(e, dmg) {
  e.hp -= dmg;
  e.hitFlash = 1;
  if (e.hp <= 0 && !e.dead) {
    e.dead = true;
    state.energy += e.bounty;
    // Combo: bajas encadenadas multiplican la puntuación
    state.combo++;
    state.comboTimer = 2.2;
    const mult = 1 + Math.min(4, Math.floor(state.combo / 5));
    state.score += e.score * mult;
    if (state.combo % 5 === 0) {
      addText(e.x, e.y - 26, `¡COMBO x${mult}!`, "#ffc94a", 15);
    }
    updateComboHUD();
    sfx.death();
    burst(e.x, e.y, e.color, e.type === "boss" ? 46 : 14, e.type === "boss" ? 6 : 3);
    addText(e.x, e.y - 10, `+${e.bounty}`, "#ffe08a", 13);
    if (e.splits) spawnSplitChildren(e);
    if (e.type === "boss") { state.shake = 16; state.score += 100; }
  }
}

// ---------- Partículas y textos ----------
function burst(x, y, color, n, speed) {
  for (let i = 0; i < n; i++) {
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

// ---------- Bucle principal ----------
let lastTime = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  if (state.running && !state.gameOver && !state.paused) update(dt);
  render();
  requestAnimationFrame(frame);
}

function update(dt) {
  state.time += dt;
  if (state.comboTimer > 0) {
    state.comboTimer -= dt;
    if (state.comboTimer <= 0) { state.combo = 0; updateComboHUD(); }
  }
  if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 40);
  if (state.corePulse > 0) state.corePulse -= dt * 2;
  if (state.pulseAnim > 0) state.pulseAnim = Math.min(1, state.pulseAnim + dt * 2);
  if (state.pulseCooldown > 0) {
    state.pulseCooldown = Math.max(0, state.pulseCooldown - dt);
    updatePulseBtn();
  }

  // Fase de construcción: cuenta atrás para autoempezar
  if (state.phase === "build" && state.wave > 0) {
    state.autoStartTimer -= dt;
    nextWaveBtn.textContent = `▶ Siguiente oleada (${Math.ceil(Math.max(0, state.autoStartTimer))}s)`;
    if (state.autoStartTimer <= 0) startWave();
  }

  // Aparición de enemigos
  if (state.phase === "wave" && state.spawnQueue.length > 0) {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnEnemy(state.spawnQueue.pop());
      const base = Math.max(0.18, 1.1 - state.wave * 0.05);
      state.spawnTimer = base * rand(0.7, 1.3);
    }
  }

  // Enemigos
  for (const e of state.enemies) {
    if (e.dead) continue;
    if (e.hitFlash > 0) e.hitFlash -= dt * 6;
    if (e.shape === "ghost") e.phased = Math.sin(state.time * 1.6 + e.wobbleSeed) > 0.15;
    const slowed = state.time < e.slowUntil ? e.slowFactor : 1;
    const dx = CX - e.x, dy = CY - e.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const wob = Math.sin(state.time * 3 + e.wobbleSeed) * 0.35;
    const ang = Math.atan2(dy, dx) + wob * (e.type === "swift" ? 1.4 : 0.6);
    const v = e.speed * slowed;
    e.x += Math.cos(ang) * v * dt;
    e.y += Math.sin(ang) * v * dt;

    if (d < CORE_RADIUS + e.radius) {
      e.dead = true;
      state.coreHp -= e.dmg;
      state.corePulse = 1;
      state.shake = Math.max(state.shake, 8);
      sfx.coreHit();
      burst(e.x, e.y, "#ff5470", 18, 4);
      addText(CX, CY - CORE_RADIUS - 12, `-${e.dmg}`, "#ff5470", 16);
      updateHUD();
      if (state.coreHp <= 0) { gameOver(); return; }
    }
  }
  state.enemies = state.enemies.filter(e => !e.dead);

  // Torres: apuntar y disparar
  for (const t of state.towers) {
    if (t.flash > 0) t.flash -= dt * 3;
    t.cooldown -= dt;
    const st = towerStats(t);
    const r2 = st.range * st.range;
    let target = null, best = Infinity;
    for (const e of state.enemies) {
      const d2 = dist2(t.x, t.y, e.x, e.y);
      if (d2 < r2) {
        // prioridad: el más cercano al núcleo
        const coreD = dist2(e.x, e.y, CX, CY);
        if (coreD < best) { best = coreD; target = e; }
      }
    }
    if (target) {
      t.angle = Math.atan2(target.y - t.y, target.x - t.x);
      if (t.cooldown <= 0) {
        t.cooldown = st.rate;
        const def = TOWER_TYPES[t.type];
        state.projectiles.push({
          x: t.x, y: t.y,
          target,
          speed: def.projSpeed,
          dmg: st.dmg,
          type: t.type,
          color: def.color,
          splash: def.splash || 0,
          slowFactor: def.slowFactor || 0,
          slowTime: def.slowTime || 0,
          trail: [],
        });
        sfx.shoot();
      }
    }
  }

  // Proyectiles
  for (const p of state.projectiles) {
    const tgt = p.target;
    if (!tgt || tgt.dead) {
      // sigue recto hasta salir de pantalla
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

    if (d < tgt.radius + 6 && !tgt.phased) {
      p.dead = true;
      sfx.hit();
      if (p.splash) {
        burst(p.x, p.y, p.color, 16, 4);
        state.shockwaves.push({ x: p.x, y: p.y, r: 4, max: p.splash, life: 0.5, color: p.color });
        for (const e of state.enemies) {
          if (!e.dead && !e.phased && dist2(e.x, e.y, p.x, p.y) < p.splash * p.splash) damageEnemy(e, p.dmg);
        }
      } else {
        burst(p.x, p.y, p.color, 5, 2);
        damageEnemy(tgt, p.dmg);
      }
      if (p.slowFactor && !tgt.dead) {
        tgt.slowUntil = state.time + p.slowTime;
        tgt.slowFactor = p.slowFactor;
      }
    }
  }
  state.projectiles = state.projectiles.filter(p => !p.dead);

  // Partículas / textos / ondas
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

  // ¿Oleada terminada?
  if (state.phase === "wave" && state.spawnQueue.length === 0 && state.enemies.length === 0) {
    endWave();
  }
}

function gameOver() {
  state.gameOver = true;
  state.shake = 24;
  sfx.coreHit();
  burst(CX, CY, "#8c78ff", 80, 8);
  burst(CX, CY, "#ff5470", 60, 6);
  if (state.score > state.best) {
    state.best = state.score;
    localStorage.setItem("geoda_best", String(state.best));
  }
  setTimeout(() => {
    document.getElementById("final-wave").textContent = state.wave;
    document.getElementById("final-score").textContent = state.score;
    document.getElementById("final-best").textContent = `Mejor puntuación: ${state.best}`;
    document.getElementById("gameover").style.display = "flex";
    nextWaveBtn.style.display = "none";
  }, 900);
}

// ---------- Render ----------
function render() {
  ctx.save();
  if (state.shake > 0.5) {
    ctx.translate(rand(-state.shake, state.shake) * 0.4, rand(-state.shake, state.shake) * 0.4);
  }
  if (backdrop) ctx.drawImage(backdrop, 0, 0);
  else { ctx.fillStyle = "#0b0a14"; ctx.fillRect(0, 0, W, H); }

  drawCore();
  for (const t of state.towers) drawTower(t);
  drawPlacementPreview();
  for (const e of state.enemies) drawEnemy(e);
  for (const p of state.projectiles) drawProjectile(p);
  for (const sw of state.shockwaves) drawShockwave(sw);
  for (const pt of state.particles) drawParticle(pt);
  for (const tx of state.texts) drawText(tx);

  ctx.restore();
}

function drawCore() {
  const pulse = 1 + Math.sin(state.time * 2.2) * 0.05 + state.corePulse * 0.18;
  const r = CORE_RADIUS * pulse;
  const hpFrac = clamp(state.coreHp / state.coreMaxHp, 0, 1);

  // Halo
  const halo = ctx.createRadialGradient(CX, CY, r * 0.4, CX, CY, r * 3.4);
  const hue = lerp(0, 165, hpFrac); // rojo cuando está dañado, verde-azulado sano
  halo.addColorStop(0, `hsla(${255 - hpFrac * 60}, 80%, 65%, ${0.28 + state.corePulse * 0.3})`);
  halo.addColorStop(1, "transparent");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(CX, CY, r * 3.4, 0, TAU);
  ctx.fill();

  // Anillo de exclusión sutil
  ctx.strokeStyle = "rgba(140,120,255,0.10)";
  ctx.setLineDash([6, 10]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(CX, CY, CORE_EXCLUSION, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);

  // Cristal central: facetas
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
      g.addColorStop(0, `hsla(${190 + hue * 0.3}, 85%, ${45 + hpFrac * 15}%, 0.95)`);
      g.addColorStop(1, `hsla(${265}, 80%, 55%, 0.95)`);
    } else {
      g.addColorStop(0, "rgba(255,255,255,0.85)");
      g.addColorStop(1, "rgba(200,230,255,0.35)");
    }
    ctx.fillStyle = g;
    ctx.fill();
  }

  // Destello del pulso cargándose
  if (state.pulseCooldown <= 0 && state.running && !state.gameOver) {
    ctx.strokeStyle = `rgba(82,229,165,${0.35 + Math.sin(state.time * 5) * 0.2})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(CX, CY, r + 8, 0, TAU);
    ctx.stroke();
  }
}

function drawTower(t) {
  const def = TOWER_TYPES[t.type];
  const st = towerStats(t);
  const hover = state.hoverTower === t;

  // Rango al pasar el ratón
  if (hover) {
    ctx.fillStyle = def.glow + "0.06)";
    ctx.strokeStyle = def.glow + "0.35)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(t.x, t.y, st.range, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  // Base
  ctx.fillStyle = "rgba(20,18,40,0.9)";
  ctx.strokeStyle = def.glow + "0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(t.x, t.y, TOWER_RADIUS, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // Cristal giratorio (apunta al objetivo)
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.rotate(t.angle);
  const glow = 0.6 + t.flash;
  ctx.shadowColor = def.color;
  ctx.shadowBlur = 10 + t.flash * 20;
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

  // Pips de nivel
  for (let i = 0; i < t.level; i++) {
    const a = -TAU / 4 + (i - (t.level - 1) / 2) * 0.5;
    ctx.fillStyle = "#ffe08a";
    ctx.beginPath();
    ctx.arc(t.x + Math.cos(a) * (TOWER_RADIUS + 6), t.y + Math.sin(a) * (TOWER_RADIUS + 6), 2.5, 0, TAU);
    ctx.fill();
  }
}

function drawPlacementPreview() {
  if (!state.running || state.gameOver || state.hoverTower) return;
  if (state.mouseY > H - 120 && Math.abs(state.mouseX - W / 2) < 320) return; // sobre la barra
  const def = TOWER_TYPES[state.selectedType];
  if (state.wave < def.unlockWave) return;
  const ok = canPlaceAt(state.mouseX, state.mouseY) && state.energy >= def.cost;
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
  const slowed = state.time < e.slowUntil;
  ctx.save();
  ctx.translate(e.x, e.y);

  ctx.shadowColor = e.color;
  ctx.shadowBlur = e.type === "boss" ? 26 : 10;
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
    // Ojo
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
    // Espectro: intangible cuando está en fase
    ctx.globalAlpha = e.phased ? 0.28 : 0.92;
    ctx.beginPath();
    ctx.arc(0, -r * 0.15, r, Math.PI, 0);
    // Base ondulada
    for (let i = 0; i <= 4; i++) {
      const px = r - (i / 4) * 2 * r;
      const py = r * 0.55 + Math.sin(state.time * 7 + i * 2 + e.wobbleSeed) * r * 0.18;
      ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    // Ojos
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#0b0a14";
    ctx.beginPath();
    ctx.arc(-r * 0.32, -r * 0.2, r * 0.14, 0, TAU);
    ctx.arc(r * 0.32, -r * 0.2, r * 0.14, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  } else {
    // blob
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

  // Indicador de ralentización
  if (slowed) {
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(74,217,232,0.8)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, r + 4, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();

  // Barra de vida (solo si está dañado)
  if (e.hp < e.maxHp) {
    const w = e.radius * 2.2;
    const frac = clamp(e.hp / e.maxHp, 0, 1);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(e.x - w / 2, e.y - e.radius - 9, w, 4);
    ctx.fillStyle = frac > 0.5 ? "#52e5a5" : frac > 0.25 ? "#ffc94a" : "#ff5470";
    ctx.fillRect(e.x - w / 2, e.y - e.radius - 9, w * frac, 4);
  }
}

function drawProjectile(p) {
  // Estela
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

// ---------- HUD / UI ----------
const uiEnergy = document.getElementById("ui-energy");
const uiWave = document.getElementById("ui-wave");
const uiScore = document.getElementById("ui-score");
const coreBar = document.getElementById("core-bar");
const toolbar = document.getElementById("toolbar");
const nextWaveBtn = document.getElementById("next-wave-btn");
const banner = document.getElementById("wave-banner");
const tooltip = document.getElementById("tooltip");

function updateHUD() {
  uiEnergy.textContent = state.energy;
  uiWave.textContent = state.wave;
  uiScore.textContent = state.score;
  const frac = clamp(state.coreHp / state.coreMaxHp, 0, 1);
  coreBar.style.width = `${frac * 100}%`;
  coreBar.style.background = frac > 0.5
    ? "linear-gradient(90deg, #52e5a5, #4ad9e8)"
    : frac > 0.25
      ? "linear-gradient(90deg, #ffc94a, #ff9a3c)"
      : "linear-gradient(90deg, #ff5470, #ff3355)";
}

const comboWrap = document.getElementById("ui-combo-wrap");
const comboVal = document.getElementById("ui-combo");
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

function refreshToolbar() {
  toolbar.querySelectorAll(".tower-btn").forEach(btn => {
    const type = btn.dataset.type;
    const def = TOWER_TYPES[type];
    const locked = state.wave < def.unlockWave;
    btn.classList.toggle("locked", locked);
    btn.classList.toggle("selected", state.selectedType === type && !locked);
    btn.querySelector(".cost").textContent = locked ? `Oleada ${def.unlockWave}` : `${def.cost} 💎`;
  });
}

function buildToolbar() {
  toolbar.innerHTML = "";
  TOWER_ORDER.forEach((type, i) => {
    const def = TOWER_TYPES[type];
    const btn = document.createElement("div");
    btn.className = "tower-btn";
    btn.dataset.type = type;
    btn.innerHTML = `<span class="key">${i + 1}</span><div class="gem" style="color:${def.color}">${def.gem}</div><div class="name">${def.name}</div><div class="cost"></div>`;
    btn.addEventListener("click", () => selectTower(type));
    btn.addEventListener("mouseenter", (ev) => {
      tooltip.innerHTML = `<b>${def.name}</b> — ${def.cost} 💎<div class="row">${def.desc}</div><div class="row">Daño ${def.dmg} · Alcance ${def.range} · Cadencia ${def.rate}s</div>`;
      tooltip.style.display = "block";
      positionTooltip(ev.clientX, ev.clientY);
    });
    btn.addEventListener("mousemove", (ev) => positionTooltip(ev.clientX, ev.clientY));
    btn.addEventListener("mouseleave", () => { tooltip.style.display = "none"; });
    toolbar.appendChild(btn);
  });

  const pulseBtn = document.createElement("div");
  pulseBtn.id = "pulse-btn";
  pulseBtn.innerHTML = `<div class="gem">⚡</div><div class="name">Pulso</div><div class="cost">ESPACIO</div>`;
  pulseBtn.addEventListener("click", firePulse);
  toolbar.appendChild(pulseBtn);
  refreshToolbar();
}

function updatePulseBtn() {
  const btn = document.getElementById("pulse-btn");
  if (!btn) return;
  const cooling = state.pulseCooldown > 0;
  btn.classList.toggle("cooling", cooling);
  btn.querySelector(".cost").textContent = cooling ? `${Math.ceil(state.pulseCooldown)}s` : "ESPACIO";
}

function positionTooltip(mx, my) {
  const pad = 16;
  tooltip.style.left = `${Math.min(mx + pad, window.innerWidth - 240)}px`;
  tooltip.style.top = `${my - 70}px`;
}

function selectTower(type) {
  const def = TOWER_TYPES[type];
  if (state.wave < def.unlockWave) { sfx.error(); return; }
  state.selectedType = type;
  refreshToolbar();
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
    const up = t.level >= 3 ? "Nivel máximo" : `Clic: mejorar por ${upgradeCost(t)} 💎`;
    const sell = `Clic derecho: vender por ${Math.round(t.invested * 0.6)} 💎`;
    tooltip.innerHTML = `<b>${def.name}</b> · Nivel ${t.level + 1}<div class="row">Daño ${st.dmg.toFixed(0)} · Alcance ${st.range.toFixed(0)}</div><div class="row">${up}</div><div class="row">${sell}</div>`;
    tooltip.style.display = "block";
    positionTooltip(ev.clientX, ev.clientY);
    canvas.style.cursor = "pointer";
  } else {
    if (!tooltip.dataset.lock) tooltip.style.display = "none";
    canvas.style.cursor = "crosshair";
  }
});

canvas.addEventListener("click", (ev) => {
  if (!state.running || state.gameOver || state.paused) return;
  ensureAudio();
  const t = towerAt(ev.clientX, ev.clientY);
  if (t) tryUpgrade(t);
  else placeTower(ev.clientX, ev.clientY);
});

canvas.addEventListener("contextmenu", (ev) => {
  ev.preventDefault();
  if (!state.running || state.gameOver || state.paused) return;
  const t = towerAt(ev.clientX, ev.clientY);
  if (t) sellTower(t);
});

function togglePause() {
  if (!state.running || state.gameOver) return;
  state.paused = !state.paused;
  document.getElementById("paused").classList.toggle("hidden", !state.paused);
}

window.addEventListener("keydown", (ev) => {
  if (ev.code === "Space") {
    ev.preventDefault();
    ensureAudio();
    firePulse();
    return;
  }
  if (ev.code === "KeyP") { togglePause(); return; }
  if (ev.code === "KeyM") { ensureAudio(); toggleMute(); return; }
  if (state.paused) return;
  const idx = ["Digit1", "Digit2", "Digit3", "Digit4"].indexOf(ev.code);
  if (idx >= 0) selectTower(TOWER_ORDER[idx]);
  if (ev.code === "Enter" && state.phase === "build" && state.running && !state.gameOver && state.wave > 0) {
    startWave();
  }
});

nextWaveBtn.addEventListener("click", () => { ensureAudio(); startWave(); });

// ---------- Inicio / reinicio ----------
function resetGame() {
  state.running = true;
  state.gameOver = false;
  state.paused = false;
  state.combo = 0;
  state.comboTimer = 0;
  document.getElementById("paused").classList.add("hidden");
  updateComboHUD();
  state.energy = 160;
  state.score = 0;
  state.wave = 0;
  state.coreHp = state.coreMaxHp;
  state.corePulse = 0;
  state.selectedType = "ruby";
  state.phase = "build";
  state.autoStartTimer = 0;
  state.pulseCooldown = 0;
  state.spawnQueue = [];
  state.towers = [];
  state.enemies = [];
  state.projectiles = [];
  state.particles = [];
  state.texts = [];
  state.shockwaves = [];
  state.time = 0;
  state.shake = 0;
  document.getElementById("gameover").style.display = "none";
  document.getElementById("menu").style.display = "none";
  buildToolbar();
  updatePulseBtn();
  updateHUD();
  showBanner("¡PREPÁRATE!", "Coloca tus primeras torres y pulsa ▶");
  nextWaveBtn.style.display = "block";
  nextWaveBtn.textContent = "▶ Primera oleada";
  state.autoStartTimer = 30;
}

document.getElementById("start-btn").addEventListener("click", () => { ensureAudio(); resetGame(); });
document.getElementById("retry-btn").addEventListener("click", () => { ensureAudio(); resetGame(); });

// ---------- Arranque ----------
resize();
buildToolbar();
updateHUD();
requestAnimationFrame(frame);
