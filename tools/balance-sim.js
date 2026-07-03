#!/usr/bin/env node
/* =========================================================
   GEODA — tools/balance-sim.js
   Simulador de balance headless. Usa las MISMAS definiciones
   y fórmulas que el juego (data.js) para estimar la curva de
   dificultad sin abrir un navegador.

   Modelo: un jugador "razonable" que gasta toda su economía
   en Rubíes mejorados (la referencia de DPS/coste) y debe
   destruir toda la vida de la oleada antes de que las sombras
   crucen la pantalla ~1,5 veces.

   Uso:
     node tools/balance-sim.js [dificultad] [oleadas]
     node tools/balance-sim.js pesadilla 30
   ========================================================= */
"use strict";

const path = require("path");
const D = require(path.join(__dirname, "..", "data.js"));
const ECON = D.ECON;

const difficulty = process.argv[2] || "normal";
const maxWave = Number(process.argv[3] || 30);
const diff = D.DIFFICULTIES[difficulty];
if (!diff) {
  console.error(`Dificultad desconocida: ${difficulty}. Usa: ${Object.keys(D.DIFFICULTIES).join(", ")}`);
  process.exit(1);
}

// ---- Referencia de eficiencia: el Rubí ----
const ruby = D.TOWER_TYPES.ruby;
// DPS medio de un rubí por nivel (incluye críticos esperados)
function rubyDps(level) {
  const dmg = ruby.dmg * (1 + ECON.levelDmg * level);
  const rate = ruby.rate * Math.pow(ECON.levelRate, level);
  const critFactor = 1 + ECON.critChance * (ECON.critMult - 1);
  return (dmg / rate) * critFactor;
}
// Coste total de un rubí a un nivel dado
function rubyCost(level) {
  let c = ruby.cost;
  for (let l = 0; l < level; l++) c += ECON.upgradeCost(ruby.cost, l);
  return c;
}
// DPS por 💎 óptimo entre niveles 0..4
function bestDpsPerEnergy() {
  let best = 0, bestLv = 0;
  for (let lv = 0; lv <= ECON.maxLevel; lv++) {
    const v = rubyDps(lv) / rubyCost(lv);
    if (v > best) { best = v; bestLv = lv; }
  }
  return { perEnergy: best, level: bestLv };
}

// ---- Presión de la oleada ----
function waveThreat(n) {
  const comp = D.waveComposition(n);
  const hpMult = ECON.hpMultiplier(n) * diff.hp;
  let totalHp = 0, totalBounty = 0, count = 0, avgSpeed = 0;
  for (const type in comp) {
    const e = D.ENEMY_TYPES[type];
    const k = comp[type];
    totalHp += e.hp * hpMult * k;
    totalBounty += Math.round(e.bounty * diff.bounty) * k;
    avgSpeed += e.speed * diff.speed * k;
    count += k;
    // Los divisores generan hijos: ~60% de vida extra por división
    if (e.splits) totalHp += e.hp * hpMult * 0.6 * e.splits * k * 0.5;
  }
  avgSpeed /= Math.max(1, count);
  return { totalHp, totalBounty, count, avgSpeed };
}

// Ventana de tiempo disponible: viaje del borde al núcleo (~media pantalla
// de 1280×800 ≈ 470 px) más el escalonado de la aparición.
function waveWindow(n, threat) {
  const travel = 470 / threat.avgSpeed;
  const spawnSpacing = Math.max(0.18, 1.1 - n * 0.05);
  return travel * 1.5 + threat.count * spawnSpacing * 0.5;
}

// ---- Simulación de economía ----
// Las sombras entran por los cuatro flancos y las torres solo cubren parte
// del mapa: un jugador real aprovecha ~55% de su DPS teórico.
const COVERAGE = 0.55;

const { perEnergy, level } = bestDpsPerEnergy();
let energy = ECON.startEnergy;
let investedDps = 0;
let coreHp = ECON.coreHp;
const rows = [];
let firstDeficit = null;

for (let n = 1; n <= maxWave; n++) {
  // Compra codiciosa antes de la oleada
  investedDps += energy * perEnergy;
  energy = 0;

  const threat = waveThreat(n);
  const window_ = waveWindow(n, threat);
  const dealt = investedDps * COVERAGE * window_;
  const margin = dealt / threat.totalHp;

  // Vida que se escapa: proporcional al déficit
  let leak = 0;
  if (margin < 1) {
    leak = Math.round((1 - margin) * threat.count * 10); // ~10 de daño medio por fuga
    coreHp = Math.max(0, coreHp + ECON.coreRegenPerWave - leak);
    if (firstDeficit === null) firstDeficit = n;
  } else {
    coreHp = Math.min(ECON.coreHp, coreHp + ECON.coreRegenPerWave);
  }

  // Ingresos de la oleada
  energy += threat.totalBounty + ECON.waveBonus(n) + (margin >= 1 ? ECON.perfectBonus : 0);

  rows.push({
    n,
    enemigos: threat.count,
    vidaTotal: Math.round(threat.totalHp),
    ventana: window_.toFixed(1),
    dpsNecesario: Math.round(threat.totalHp / window_),
    dpsJugador: Math.round(investedDps),
    margen: margin.toFixed(2),
    fuga: leak,
    nucleo: coreHp,
  });
  if (coreHp <= 0) break;
}

// ---- Informe ----
console.log(`\nGEODA · Simulador de balance — dificultad: ${difficulty} (referencia: Rubí nivel ${level + 1}, ${perEnergy.toFixed(3)} DPS/💎)\n`);
const cols = ["n", "enemigos", "vidaTotal", "ventana", "dpsNecesario", "dpsJugador", "margen", "fuga", "nucleo"];
const header = ["OLA", "ENEM", "VIDA", "VENTANA", "DPS-REQ", "DPS-JUG", "MARGEN", "FUGA", "NÚCLEO"];
console.log(header.map((h, i) => String(h).padStart(i === 0 ? 4 : 8)).join(" "));
for (const r of rows) {
  const line = cols.map((c, i) => String(r[c]).padStart(i === 0 ? 4 : 8)).join(" ");
  const flag = Number(r.margen) < 1 ? "  ⚠" : Number(r.margen) < 1.3 ? "  ·" : "";
  console.log(line + flag);
}

console.log("");
if (firstDeficit === null) {
  console.log(`✅ Sin déficit de DPS en ${rows.length} oleadas: la curva es holgada (considera endurecer).`);
} else {
  console.log(`⚠ Primer déficit de DPS en la oleada ${firstDeficit}.`);
}
const lastCore = rows[rows.length - 1].nucleo;
if (lastCore <= 0) {
  console.log(`💀 El modelo pierde en la oleada ${rows[rows.length - 1].n}.`);
} else {
  console.log(`🔮 Núcleo del modelo al final: ${lastCore}/${ECON.coreHp}.`);
}
console.log(`   (Cobertura del mapa modelada al ${Math.round(COVERAGE * 100)}%. El modelo ignora habilidades, reliquias y sinergias: son el margen del jugador.)\n`);
