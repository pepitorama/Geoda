/* =========================================================
   GEODA — data.js
   Fuente única de verdad: definiciones de juego, fórmulas de
   balance, textos ES/EN y PRNG determinista. La consumen el
   motor (game.js, navegador) y las herramientas headless
   (tools/balance-sim.js, Node).
   ========================================================= */
(function (root, factory) {
  const D = factory();
  if (typeof module === "object" && module.exports) module.exports = D;
  if (root) root.GeodaData = D;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  // ---------- PRNG determinista (mulberry32) ----------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function seedFromDate(d) {
    // AAAAMMDD como entero: mismo desafío para todo el mundo ese día
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }

  // ---------- Dificultades ----------
  const DIFFICULTIES = {
    relajado: { name: { es: "Relajado", en: "Relaxed" }, hp: 0.75, speed: 0.9, bounty: 1.2, score: 0.7, color: "#52e5a5" },
    normal: { name: { es: "Normal", en: "Normal" }, hp: 1, speed: 1, bounty: 1, score: 1, color: "#8c78ff" },
    pesadilla: { name: { es: "Pesadilla", en: "Nightmare" }, hp: 1.45, speed: 1.12, bounty: 0.85, score: 1.6, color: "#ff5470" },
    abismo: { name: { es: "Abismo", en: "Abyss" }, hp: 1.85, speed: 1.18, bounty: 0.85, score: 2.6, color: "#ff2f6a" },
  };

  // ---------- Torres ----------
  const TOWER_TYPES = {
    ruby: {
      name: { es: "Rubí", en: "Ruby" }, gem: "🔴", color: "#ff5470", glow: "rgba(255,84,112,",
      cost: 60, dmg: 8, rate: 0.35, range: 140, projSpeed: 520,
      desc: { es: "Disparo rápido a un objetivo.", en: "Fast single-target shots." }, unlockWave: 0,
    },
    sapphire: {
      name: { es: "Zafiro", en: "Sapphire" }, gem: "🔵", color: "#4ad9e8", glow: "rgba(74,217,232,",
      cost: 80, dmg: 4, rate: 0.5, range: 130, projSpeed: 460,
      slowFactor: 0.5, slowTime: 1.6,
      desc: { es: "Ralentiza a los enemigos un 50%.", en: "Slows enemies by 50%." }, unlockWave: 0,
    },
    emerald: {
      name: { es: "Esmeralda", en: "Emerald" }, gem: "🟢", color: "#52e5a5", glow: "rgba(82,229,165,",
      cost: 110, dmg: 12, rate: 0.9, range: 150, projSpeed: 380, splash: 62,
      desc: { es: "Explosión con daño en área.", en: "Explosive area damage." }, unlockWave: 2,
    },
    amethyst: {
      name: { es: "Amatista", en: "Amethyst" }, gem: "🟣", color: "#b06df0", glow: "rgba(176,109,240,",
      cost: 130, dmg: 11, rate: 0.85, range: 160, chain: 4, chainRange: 120,
      desc: { es: "Rayo que salta entre 4 enemigos.", en: "Lightning that chains to 4 enemies." }, unlockWave: 3,
    },
    amber: {
      name: { es: "Ámbar", en: "Amber" }, gem: "🟡", color: "#ffc94a", glow: "rgba(255,201,74,",
      cost: 150, dmg: 42, rate: 1.7, range: 270, projSpeed: 780, pierce: 3,
      desc: { es: "Francotirador: perfora hasta 3 enemigos.", en: "Sniper: pierces up to 3 enemies." }, unlockWave: 4,
    },
    diamond: {
      name: { es: "Diamante", en: "Diamond" }, gem: "⚪", color: "#e8f4ff", glow: "rgba(232,244,255,",
      cost: 200, dmg: 26, range: 175, beam: true,
      desc: { es: "Láser continuo que se intensifica.", en: "Continuous ramping laser." }, unlockWave: 6,
    },
    // Torres especiales: se compran una vez con fragmentos en el menú
    opal: {
      name: { es: "Ópalo", en: "Opal" }, gem: "🫧", color: "#ff9ff5", glow: "rgba(255,159,245,",
      cost: 120, range: 120, support: true, auraDmg: 0.15, auraRate: 0.08,
      desc: { es: "No ataca: su aura da +15% daño y +8% cadencia a las torres vecinas.", en: "Doesn't attack: its aura grants +15% damage and +8% fire rate to nearby towers." },
      unlockWave: 2, metaUnlock: 100,
    },
    obsidian: {
      name: { es: "Obsidiana", en: "Obsidian" }, gem: "⚫", color: "#9d8fc4", glow: "rgba(157,143,196,",
      cost: 180, dmg: 55, rate: 2.4, range: 320, minRange: 110, splash: 80, mortar: true,
      desc: { es: "Mortero de largo alcance con gran explosión. No dispara de cerca.", en: "Long-range mortar with a huge blast. Can't fire up close." },
      unlockWave: 5, metaUnlock: 150,
    },
  };
  const TOWER_ORDER = ["ruby", "sapphire", "emerald", "amethyst", "amber", "diamond", "opal", "obsidian"];

  // ---------- Ramas de mejora (tras evolucionar: Tier I → II → III) ----------
  // Diseño de balance: cada tier sube stats Y coste de forma que el DPS por 💎
  // se mantiene ~constante; concentra poder (pocas super-torres) sin poder gratis.
  const EVO_TIER = {
    maxTier: 3,
    cost: [0, 250, 450, 750],  // [_, TierI(evolución), TierII, TierIII]
    dmgPer: 0.38, rangePer: 0.05, ratePer: 0.06,
    roman: ["", "I", "II", "III"],
  };

  // ---------- Evoluciones (nivel máximo → especialización) ----------
  const EVOLUTION_COST = 250;
  const EVOLUTIONS = {
    ruby: [
      { id: "ember", icon: "🔥", name: { es: "Corazón Ígneo", en: "Ember Heart" }, desc: { es: "Sus impactos queman: 50% del daño extra durante 2 s.", en: "Hits ignite: 50% bonus damage over 2 s." } },
      { id: "twin", icon: "🎯", name: { es: "Bífido", en: "Twinshot" }, desc: { es: "Dispara a 2 objetivos a la vez.", en: "Fires at 2 targets at once." } },
    ],
    sapphire: [
      { id: "zero", icon: "❄️", name: { es: "Cero Absoluto", en: "Absolute Zero" }, desc: { es: "25% de probabilidad de congelar 0,5 s.", en: "25% chance to freeze for 0.5 s." } },
      { id: "vortex", icon: "🌀", name: { es: "Vórtice", en: "Vortex" }, desc: { es: "Aura constante: todo su radio queda ralentizado un 30%.", en: "Constant aura: everything in range is slowed 30%." } },
    ],
    emerald: [
      { id: "nova", icon: "💥", name: { es: "Nova", en: "Nova" }, desc: { es: "+50% de radio de explosión.", en: "+50% blast radius." } },
      { id: "spore", icon: "🍄", name: { es: "Esporas", en: "Spores" }, desc: { es: "Sus víctimas explotan al morir (40% del daño).", en: "Its victims explode on death (40% damage)." } },
    ],
    amethyst: [
      { id: "super", icon: "⛓️", name: { es: "Superconductor", en: "Superconductor" }, desc: { es: "El rayo salta a 7 enemigos sin perder daño.", en: "Chains to 7 enemies with no falloff." } },
      { id: "static", icon: "😵", name: { es: "Estática", en: "Static" }, desc: { es: "25% de probabilidad de aturdir 0,4 s a cada alcanzado.", en: "25% chance to stun each target 0.4 s." } },
    ],
    amber: [
      { id: "executioner", icon: "🪓", name: { es: "Ejecutor", en: "Executioner" }, desc: { es: "Daño ×2,5 a enemigos con menos del 30% de vida.", en: "×2.5 damage to enemies below 30% HP." } },
      { id: "ballista", icon: "🏹", name: { es: "Balista", en: "Ballista" }, desc: { es: "Perforación ilimitada y +30% de alcance.", en: "Unlimited pierce and +30% range." } },
    ],
    diamond: [
      { id: "prism", icon: "🔱", name: { es: "Prisma", en: "Prism" }, desc: { es: "El láser se refracta a 2 objetivos extra (50% del daño).", en: "The laser refracts to 2 extra targets (50% damage)." } },
      { id: "focus", icon: "🎇", name: { es: "Foco", en: "Focus" }, desc: { es: "La intensificación llega hasta ×4 de daño.", en: "Ramps all the way to ×4 damage." } },
    ],
    opal: [
      { id: "beacon", icon: "🗼", name: { es: "Faro", en: "Beacon" }, desc: { es: "Su aura también otorga +15% de alcance.", en: "Its aura also grants +15% range." } },
      { id: "prospector", icon: "⛏️", name: { es: "Prospector", en: "Prospector" }, desc: { es: "Extrae 1 💎 cada 2 segundos.", en: "Mines 1 💎 every 2 seconds." } },
    ],
    obsidian: [
      { id: "magma", icon: "🌋", name: { es: "Magma", en: "Magma" }, desc: { es: "La explosión deja un charco ardiente 3 s (quema a quien lo pisa).", en: "The blast leaves a burning pool for 3 s." } },
      { id: "seismic", icon: "🌊", name: { es: "Sísmica", en: "Seismic" }, desc: { es: "La explosión ralentiza un 40% durante 2 s.", en: "The blast slows by 40% for 2 s." } },
    ],
  };

  // ---------- Sinergias de adyacencia (radio 80 px, tipos únicos) ----------
  const SYNERGY_RADIUS = 80;
  const SYNERGIES = {
    ruby: { stat: "dmg", mult: 1.10, label: { es: "+10% daño", en: "+10% damage" } },
    sapphire: { stat: "rate", mult: 0.92, label: { es: "+8% cadencia", en: "+8% fire rate" } },
    emerald: { stat: "range", mult: 1.08, label: { es: "+8% alcance", en: "+8% range" } },
    amethyst: { stat: "crit", add: 0.05, label: { es: "+5% prob. crítico", en: "+5% crit chance" } },
    amber: { stat: "critDmg", add: 0.25, label: { es: "+25% daño crítico", en: "+25% crit damage" } },
    diamond: { stat: "stunImmune", label: { es: "inmune a aturdimiento", en: "stun immunity" } },
  };

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
    warden: { hp: 90, speed: 32, radius: 15, dmg: 14, bounty: 30, score: 60, color: "#c9a2ff", shape: "warden" },
    boss: { hp: 700, speed: 20, radius: 34, dmg: 60, bounty: 160, score: 400, color: "#ff4a6e", shape: "boss" },
    mega: { hp: 2200, speed: 13, radius: 48, dmg: 100, bounty: 420, score: 1200, color: "#ff2255", shape: "boss", mega: true },
  };
  const ENEMY_ICONS = {
    mote: "●", swift: "▲", brute: "⬢", splitter: "◐", healer: "✚",
    ghost: "👻", armored: "▣", digger: "⛏", warden: "◈", boss: "☠", mega: "💀",
  };
  // Paleta alternativa (accesible) para el modo daltónico: Okabe-Ito adaptada
  const ENEMY_COLORS_CB = {
    mote: "#56B4E9", swift: "#E69F00", brute: "#0072B2", splitter: "#CC79A7",
    healer: "#009E73", ghost: "#F0E442", armored: "#999999", digger: "#D55E00",
    warden: "#CC79A7", boss: "#E51E32", mega: "#B2182B",
  };

  // ---------- Jefes con identidad (rotación en oleadas 5,15,20…; la 10/20/30 es mega) ----------
  const BOSS_KINDS = {
    devourer: {
      id: "devourer", icon: "🩸",
      name: { es: "El Devorador", en: "The Devourer" },
      trait: { es: "Se enfurece por debajo del 50% de vida: +60% velocidad.", en: "Enrages below 50% HP: +60% speed." },
    },
    weaver: {
      id: "weaver", icon: "🕸️",
      name: { es: "La Tejedora", en: "The Weaver" },
      trait: { es: "Teje 2 motas cada 5 segundos.", en: "Weaves 2 motes every 5 seconds." },
    },
    colossus: {
      id: "colossus", icon: "🛡️",
      name: { es: "El Coloso", en: "The Colossus" },
      trait: { es: "Cada 7 s gana un escudo que absorbe 6 impactos.", en: "Every 7 s gains a shield absorbing 6 hits." },
    },
  };
  const BOSS_ROTATION = ["devourer", "weaver", "colossus"];

  // ---------- Afijos de élite ----------
  const ELITE_AFFIXES = {
    regen: { id: "regen", icon: "♻", color: "#7dffa8", name: { es: "Regenerador", en: "Regenerating" } },
    swift: { id: "swift", icon: "»", color: "#ff8ac2", name: { es: "Veloz", en: "Swift" } },
    shielded: { id: "shielded", icon: "◈", color: "#8fd4ff", name: { es: "Escudado", en: "Shielded" } },
  };

  // ---------- Mutadores de oleada ----------
  const MUTATORS = {
    swarm: { id: "swarm", icon: "🐝", count: 1.5, hp: 0.7, name: { es: "Enjambre", en: "Swarm" }, desc: { es: "+50% de enemigos con -30% de vida", en: "+50% enemies with -30% HP" } },
    frenzy: { id: "frenzy", icon: "💨", speed: 1.25, name: { es: "Frenesí", en: "Frenzy" }, desc: { es: "+25% de velocidad enemiga", en: "+25% enemy speed" } },
    plated: { id: "plated", icon: "🧱", hp: 1.4, name: { es: "Blindaje", en: "Plated" }, desc: { es: "+40% de vida enemiga", en: "+40% enemy HP" } },
    fog: { id: "fog", icon: "🌫️", towerRange: 0.8, name: { es: "Niebla", en: "Fog" }, desc: { es: "-20% de alcance de tus torres", en: "-20% tower range" } },
    greed: { id: "greed", icon: "🤑", bounty: 1.5, speed: 1.15, name: { es: "Avaricia", en: "Greed" }, desc: { es: "+50% de botín, +15% de velocidad", en: "+50% bounty, +15% speed" } },
    regen: { id: "regen", icon: "🌿", regen: 0.02, name: { es: "Vitalidad", en: "Vitality" }, desc: { es: "Los enemigos regeneran un 2%/s", en: "Enemies regenerate 2%/s" } },
  };
  const MUTATOR_CHANCE = 0.4;
  const MUTATOR_MIN_WAVE = 4;

  // ---------- Reliquias (draft cada 3 oleadas) ----------
  const RELICS = {
    fang: { id: "fang", icon: "🗡️", name: { es: "Colmillo de obsidiana", en: "Obsidian Fang" }, desc: { es: "+8% de daño global", en: "+8% global damage" } },
    magnet: { id: "magnet", icon: "🧲", name: { es: "Imán de gemas", en: "Gem Magnet" }, desc: { es: "Las gemas se recogen desde 3× distancia y valen +3", en: "Gems collect from 3× range and are worth +3" } },
    reactor: { id: "reactor", icon: "⚛️", name: { es: "Reactor arcano", en: "Arcane Reactor" }, desc: { es: "-15% de recarga de habilidades", en: "-15% ability cooldowns" } },
    market: { id: "market", icon: "🏪", name: { es: "Mercado negro", en: "Black Market" }, desc: { es: "-10% de coste de torres", en: "-10% tower cost" } },
    bastion: { id: "bastion", icon: "🏰", name: { es: "Bastión", en: "Bastion" }, desc: { es: "+20 de vida máxima y cura 20 al instante", en: "+20 max HP and heals 20 instantly" } },
    adrenaline: { id: "adrenaline", icon: "💉", name: { es: "Adrenalina", en: "Adrenaline" }, desc: { es: "La ventana de combo dura +1 s", en: "Combo window lasts +1 s" } },
    sniper: { id: "sniper", icon: "🔭", name: { es: "Lente telescópica", en: "Telescopic Lens" }, desc: { es: "+10% de alcance global", en: "+10% global range" } },
    vampiric: { id: "vampiric", icon: "🦇", name: { es: "Cristal vampírico", en: "Vampiric Crystal" }, desc: { es: "El 1% del daño infligido cura al núcleo", en: "1% of damage dealt heals the core" } },
    treasurer: { id: "treasurer", icon: "🪙", name: { es: "Tesorero", en: "Treasurer" }, desc: { es: "Interés del 7% con tope de 80", en: "7% interest, capped at 80" } },
    pyro: { id: "pyro", icon: "🎆", name: { es: "Pirotecnia", en: "Pyrotechnics" }, desc: { es: "Los críticos explotan (50% del daño en área)", en: "Crits explode (50% damage in an area)" } },
    frost: { id: "frost", icon: "🧊", name: { es: "Escarcha eterna", en: "Eternal Frost" }, desc: { es: "Todos los impactos ralentizan un 15%", en: "All hits slow by 15%" } },
    echo: { id: "echo", icon: "🔁", name: { es: "Eco resonante", en: "Resonant Echo" }, desc: { es: "El Pulso se lanza dos veces", en: "Pulse fires twice" } },
    phoenix: { id: "phoenix", icon: "❤️‍🔥", name: { es: "Núcleo Fénix", en: "Phoenix Core" }, desc: { es: "Una vez por partida, revive al núcleo al 35% y arrasa con un gran pulso", en: "Once per run, revives the core to 35% and unleashes a huge pulse" } },
  };
  const RELIC_INTERVAL = 3;

  // ---------- Disposiciones de mapa ----------
  const LAYOUTS = {
    cavern: {
      id: "cavern", icon: "🕳️", sides: [0, 1, 2, 3], score: 1,
      name: { es: "Caverna", en: "Cavern" },
      desc: { es: "Rocas dispersas y vetas de poder. El clásico.", en: "Scattered rocks and power veins. The classic." },
    },
    gorge: {
      id: "gorge", icon: "🏔️", sides: [1, 3], score: 1.15,
      name: { es: "Desfiladero", en: "Gorge" },
      desc: { es: "Murallas de roca canalizan a las sombras por un corredor. Solo entran por los flancos. +15% puntuación.", en: "Rock walls funnel the shadows through a corridor. They only enter from the flanks. +15% score." },
    },
    archipelago: {
      id: "archipelago", icon: "🏝️", sides: [0, 1, 2, 3], score: 1.05,
      name: { es: "Archipiélago", en: "Archipelago" },
      desc: { es: "Muchas rocas pequeñas, poco sitio para construir. +5% puntuación.", en: "Many small rocks, little room to build. +5% score." },
    },
    void: {
      id: "void", icon: "🌌", sides: [0, 1, 2, 3], score: 1.1,
      name: { es: "Vacío", en: "Void" },
      desc: { es: "Sin rocas ni vetas: campo abierto, sin ayudas. +10% puntuación.", en: "No rocks, no veins: open field, no help. +10% score." },
    },
    ring: {
      id: "ring", icon: "⭕", sides: [0, 1, 2, 3], score: 1.1,
      name: { es: "Anillo", en: "Ring" },
      desc: { es: "Una muralla circular con tres brechas rodea el núcleo.", en: "A circular wall with three breaches surrounds the core." },
    },
    pillars: {
      id: "pillars", icon: "🏛️", sides: [0, 1, 2, 3], score: 1.08,
      name: { es: "Pilares", en: "Pillars" },
      desc: { es: "Cuatro grandes columnas de roca dividen el campo en lanes.", en: "Four great rock pillars split the field into lanes." },
    },
    garden: {
      id: "garden", icon: "🌿", sides: [0, 1, 2, 3], score: 0.95,
      name: { es: "Jardín de cristal", en: "Crystal Garden" },
      desc: { es: "Pocas rocas y muchas vetas de poder. Terreno generoso.", en: "Few rocks and many power veins. Generous ground." },
    },
    spiral: {
      id: "spiral", icon: "🌀", sides: [0, 1, 2, 3], score: 1.12,
      name: { es: "Espiral", en: "Spiral" },
      desc: { es: "Un brazo de roca en espiral encauza a las sombras. +12% puntuación.", en: "A spiral rock arm channels the shadows. +12% score." },
    },
  };
  // El Anillo es exclusivo de la campaña: no aparece en el selector
  const LAYOUT_ORDER = ["cavern", "gorge", "archipelago", "void", "pillars", "garden", "spiral"];

  // ---------- Campaña ----------
  const CAMPAIGN = [
    {
      id: "c1", icon: "🌅", waves: 8, layout: "cavern", seed: 1101,
      name: { es: "El despertar", en: "The Awakening" },
      desc: { es: "Las primeras sombras ponen a prueba la caverna.", en: "The first shadows test the cavern." },
    },
    {
      id: "c2", icon: "🚫", waves: 10, layout: "cavern", seed: 2202, banned: ["sapphire"],
      name: { es: "Sin hielo", en: "No Ice" },
      desc: { es: "El Zafiro está prohibido: nada de ralentizar.", en: "Sapphire is banned: no slowing allowed." },
    },
    {
      id: "c3", icon: "🏔️", waves: 10, layout: "gorge", seed: 3303,
      name: { es: "El desfiladero", en: "The Gorge" },
      desc: { es: "Canaliza la marea por el corredor de roca.", en: "Funnel the tide through the rock corridor." },
    },
    {
      id: "c4", icon: "💸", waves: 10, layout: "archipelago", seed: 4404, startEnergy: 80,
      name: { es: "Presupuesto ajustado", en: "Tight Budget" },
      desc: { es: "Empiezas con solo 80 💎 entre las islas de roca.", en: "You start with just 80 💎 among the rock islands." },
    },
    {
      id: "c5", icon: "🫀", waves: 12, layout: "cavern", seed: 5505, coreHp: 40,
      name: { es: "Núcleo frágil", en: "Fragile Core" },
      desc: { es: "El núcleo late con solo 40 de vida. Que nada lo toque.", en: "The core beats with only 40 HP. Let nothing touch it." },
    },
    {
      id: "c6", icon: "🌫️", waves: 12, layout: "void", seed: 6606, mutator: "fog",
      name: { es: "Niebla eterna", en: "Eternal Fog" },
      desc: { es: "Niebla permanente: -20% de alcance en campo abierto.", en: "Permanent fog: -20% range in an open field." },
    },
    {
      id: "c7", icon: "⭕", waves: 12, layout: "ring", seed: 7707,
      name: { es: "El anillo", en: "The Ring" },
      desc: { es: "Defiende las tres brechas de la muralla circular.", en: "Defend the three breaches in the circular wall." },
    },
    {
      id: "c8", icon: "💨", waves: 13, layout: "gorge", seed: 8808, mutator: "frenzy",
      name: { es: "Marea veloz", en: "Swift Tide" },
      desc: { es: "Frenesí permanente: +25% de velocidad enemiga.", en: "Permanent frenzy: +25% enemy speed." },
    },
    {
      id: "c9", icon: "🕳️", waves: 15, layout: "ring", seed: 9909, coreHp: 80, hpMult: 1.15,
      name: { es: "El corazón del abismo", en: "The Heart of the Abyss" },
      desc: { es: "Quince oleadas endurecidas y un mega-jefe final.", en: "Fifteen hardened waves and a final mega-boss." },
    },
  ];
  const STAR_THRESHOLDS = { two: 0.6, three: 0.95 };
  const STAR_REWARD = 15;

  // ---------- Ascensión (new game+) ----------
  // Cada victoria en modo libre al nivel máximo desbloquea el siguiente
  const ASCENSION = { hpPer: 0.08, speedPer: 0.02, bountyPer: 0.02, scorePer: 0.2, max: 10 };

  // ---------- El Centinela (guardián controlable) ----------
  const SENTINEL = {
    metaUnlock: 200,
    dmg: 11, rate: 0.42, range: 118, projSpeed: 640,
    follow: 6.5,                 // suavizado del seguimiento al cursor
    novaCd: 18, novaDmg: 70, novaRadius: 135,
    // Progresión de héroe (inspirada en Bloons/Kingdom Rush): sube de nivel con bajas
    levelXp: [8, 20, 38, 62],    // bajas acumuladas para los niveles 2..5
    dmgPerLvl: 0.16, rangePerLvl: 0.06, novaCdPerLvl: 1.3, ratePerLvl: 0.05,
    color: "#7dfcff", glow: "rgba(125,252,255,",
    name: { es: "Centinela", en: "Sentinel" },
    desc: {
      es: "Un guardián que sigue tu cursor y dispara solo durante las oleadas. Pulsa G para su nova de escarcha.",
      en: "A guardian that follows your cursor and auto-fires during waves. Press G for its frost nova.",
    },
  };

  // ---------- Habilidades ----------
  const ABILITIES = [
    { id: "pulse", icon: "⚡", name: { es: "Pulso", en: "Pulse" }, key: "ESP", keyEn: "SPC", code: "Space", cd: 25, unlock: 0, desc: { es: "Onda que daña y empuja alrededor del núcleo.", en: "Wave that damages and knocks back around the core." } },
    { id: "storm", icon: "☄️", name: { es: "Tormenta", en: "Storm" }, key: "Q", keyEn: "Q", code: "KeyQ", cd: 45, unlock: 3, desc: { es: "12 meteoros de cristal caen sobre los enemigos.", en: "12 crystal meteors rain on enemies." } },
    { id: "shield", icon: "🛡️", name: { es: "Escudo", en: "Shield" }, key: "E", keyEn: "E", code: "KeyE", cd: 60, unlock: 5, desc: { es: "El núcleo es invulnerable durante 4 segundos.", en: "The core is invulnerable for 4 seconds." } },
    { id: "over", icon: "🔥", name: { es: "Sobrecarga", en: "Overdrive" }, key: "R", keyEn: "R", code: "KeyR", cd: 50, unlock: 8, desc: { es: "Las torres disparan el doble de rápido 6 segundos.", en: "Towers fire twice as fast for 6 seconds." } },
  ];

  // ---------- Tienda permanente ----------
  const SHOP = [
    { id: "core", icon: "🔮", name: { es: "Núcleo reforzado", en: "Reinforced Core" }, desc: { es: "+15 de vida máxima del núcleo", en: "+15 max core HP" }, max: 3 },
    { id: "energy", icon: "💎", name: { es: "Reservas profundas", en: "Deep Reserves" }, desc: { es: "+30 de energía inicial", en: "+30 starting energy" }, max: 3 },
    { id: "dmg", icon: "⚔️", name: { es: "Cristales afilados", en: "Sharpened Crystals" }, desc: { es: "+5% de daño de todas las torres", en: "+5% damage for all towers" }, max: 3 },
    { id: "cdr", icon: "⏱️", name: { es: "Condensador arcano", en: "Arcane Capacitor" }, desc: { es: "-10% de recarga de habilidades", en: "-10% ability cooldowns" }, max: 3 },
    { id: "discount", icon: "🏷️", name: { es: "Cantera eficiente", en: "Efficient Quarry" }, desc: { es: "-5% de coste de las torres", en: "-5% tower cost" }, max: 3 },
  ];
  const shopCost = (level) => 30 * (level + 1);

  // ---------- Logros ----------
  const ACHIEVEMENTS = [
    { id: "first", icon: "🩸", name: { es: "Primera sangre", en: "First Blood" }, desc: { es: "Destruye tu primera sombra", en: "Destroy your first shadow" }, frag: 5 },
    { id: "builder", icon: "🏗️", name: { es: "Constructor", en: "Builder" }, desc: { es: "Construye 10 torres en una partida", en: "Build 10 towers in one run" }, frag: 10 },
    { id: "rich", icon: "💰", name: { es: "Economista", en: "Economist" }, desc: { es: "Acumula 500 de energía", en: "Hold 500 energy" }, frag: 10 },
    { id: "combo", icon: "🔥", name: { es: "Imparable", en: "Unstoppable" }, desc: { es: "Alcanza un combo x5", en: "Reach a x5 combo" }, frag: 15 },
    { id: "boss", icon: "☠️", name: { es: "Cazajefes", en: "Boss Hunter" }, desc: { es: "Derrota a un jefe", en: "Defeat a boss" }, frag: 15 },
    { id: "mega", icon: "💀", name: { es: "Megacazador", en: "Mega Hunter" }, desc: { es: "Derrota a un mega-jefe", en: "Defeat a mega-boss" }, frag: 25 },
    { id: "perfect", icon: "✨", name: { es: "Impecable", en: "Flawless" }, desc: { es: "Supera una oleada sin daño al núcleo", en: "Clear a wave with no core damage" }, frag: 10 },
    { id: "vet", icon: "🎖️", name: { es: "Veterano", en: "Veteran" }, desc: { es: "Alcanza la oleada 10", en: "Reach wave 10" }, frag: 15 },
    { id: "legend", icon: "👑", name: { es: "Leyenda de la caverna", en: "Cavern Legend" }, desc: { es: "Sobrevive a las 25 oleadas", en: "Survive all 25 waves" }, frag: 50 },
    { id: "gems", icon: "💠", name: { es: "Coleccionista", en: "Collector" }, desc: { es: "Recoge 20 gemas en una partida", en: "Collect 20 gems in one run" }, frag: 10 },
    { id: "crit", icon: "⚡", name: { es: "Golpe maestro", en: "Master Strike" }, desc: { es: "Asesta 50 críticos en una partida", en: "Land 50 crits in one run" }, frag: 10 },
    { id: "kills", icon: "🌌", name: { es: "Demoledor", en: "Demolisher" }, desc: { es: "1000 bajas acumuladas en total", en: "1000 total kills" }, frag: 30 },
    { id: "prospect", icon: "🔓", name: { es: "Prospector", en: "Prospector" }, desc: { es: "Desbloquea una torre especial", en: "Unlock a special tower" }, frag: 15 },
    { id: "strategist", icon: "🧠", name: { es: "Estratega", en: "Strategist" }, desc: { es: "Gana en el Desfiladero", en: "Win on the Gorge" }, frag: 25 },
    { id: "cartographer", icon: "🗺️", name: { es: "Cartógrafo", en: "Cartographer" }, desc: { es: "Juega en los 4 mapas", en: "Play all 4 maps" }, frag: 20 },
    { id: "challenger", icon: "🎲", name: { es: "Retador", en: "Challenger" }, desc: { es: "Juega un código compartido", en: "Play a shared code" }, frag: 10 },
    { id: "conqueror", icon: "🗻", name: { es: "Conquistador", en: "Conqueror" }, desc: { es: "Completa los 9 niveles de la campaña", en: "Complete all 9 campaign levels" }, frag: 60 },
    { id: "perfectionist", icon: "🌟", name: { es: "Perfeccionista", en: "Perfectionist" }, desc: { es: "Consigue 3 estrellas en un nivel", en: "Earn 3 stars on a level" }, frag: 20 },
    { id: "architect", icon: "🛠️", name: { es: "Arquitecto", en: "Architect" }, desc: { es: "Juega un mapa del editor", en: "Play a map from the editor" }, frag: 15 },
    { id: "ascended", icon: "☄️", name: { es: "Ascendido", en: "Ascended" }, desc: { es: "Gana una partida con Ascensión", en: "Win a run with Ascension" }, frag: 30 },
    { id: "guardian", icon: "🛡️", name: { es: "Guardián", en: "Guardian" }, desc: { es: "Lanza la nova del Centinela", en: "Fire the Sentinel's nova" }, frag: 15 },
  ];

  // ---------- Economía y progresión ----------
  const ECON = {
    startEnergy: 160,
    coreHp: 100,
    winWave: 25,
    interestRate: 0.05,
    interestCap: 50,
    waveBonus: (n) => 30 + n * 6,
    perfectBonus: 25,
    earlyBonusDiv: 2,      // energía extra = segundos restantes / 2
    coreRegenPerWave: 6,
    gemValue: 5,
    gemDropChance: 0.15,
    maxLevel: 4,           // niveles 0..4 => "Nivel 1..5"
    upgradeCost: (baseCost, level) => Math.round(baseCost * 0.6 * (level + 1)),
    sellRefund: 0.6,
    critChance: 0.1,
    critMult: 2,
    vetKillsPerStep: 10, vetStepBonus: 0.02, vetCap: 0.2,
    levelDmg: 0.35, levelRange: 0.08, levelRate: 0.88,
    // Lineal, con un endurecimiento tardío (n>12) para que la rama profunda
    // sea necesaria en el final, y superlineal en el modo infinito. Ajustado
    // con tools/balance-sim.js para mantener el margen por encima de 1.
    hpMultiplier: (n) => 1 + (n - 1) * 0.22 + (n > 12 ? (n - 12) * 0.05 : 0) + (n > 25 ? Math.pow(n - 25, 1.5) * 0.05 : 0),
    fragmentsEarned: (wave, score) => wave * 3 + Math.floor(score / 250),
    powerSpotBonus: 1.25,
  };

  // ---------- Composición de oleadas ----------
  function waveComposition(n) {
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
      if (n >= 9) add("warden", 1 + Math.floor(n / 8));
    }
    return c;
  }
  function bossKindForWave(n) {
    if (n % 10 === 0) return null; // mega
    return BOSS_ROTATION[(Math.floor(n / 5) - 1 + BOSS_ROTATION.length * 10) % BOSS_ROTATION.length];
  }

  // ---------- Textos de interfaz ----------
  const STRINGS = {
    es: {
      tagline: "Defiende el Núcleo",
      intro: "Las sombras vienen a devorar el último núcleo de geoda. Construye cristales, elige reliquias y sobrevive <b>25 oleadas</b>.",
      difficulty: "Dificultad", start: "COMENZAR", cont: "⏵ CONTINUAR", daily: "📅 Desafío diario",
      dailyBest: "Mejor de hoy", settings: "⚙ Ajustes", shopTitle: "💠 Mejoras permanentes",
      achTitle: "🏆 Logros", historyTitle: "📜 Últimas partidas", helpHint: "Pulsa <b>H</b> durante la partida para ver todos los controles.",
      best: "Mejor puntuación", fragments: "Fragmentos", totalKills: "Bajas totales",
      pause: "PAUSA", resume: "CONTINUAR", restart: "Reiniciar", menu: "Menú",
      helpTitle: "Guía de la caverna", back: "VOLVER",
      nextWave: "▶ Siguiente oleada", firstWave: "▶ Primera oleada", waveN: "Oleada",
      shadowsLeft: (n) => `${n} sombras restantes`,
      defeat: "EL NÚCLEO HA CAÍDO", victoryT: "🏆 ¡LA CAVERNA ESTÁ A SALVO!",
      victoryP: "Has resistido las 25 oleadas. La geoda brilla más que nunca.",
      endless: "♾ MODO INFINITO", retry: "REINTENTAR",
      draftTitle: "✨ Elige una reliquia", draftSub: "Un poder permanente para esta partida",
      statWaves: "Oleadas", statScore: "Puntuación", statKills: "Bajas", statDmg: "Daño infligido",
      statTowers: "Torres construidas", statCrits: "Críticos", statGems: "Gemas recogidas", statPerfect: "Oleadas perfectas",
      chartTitle: "Daño por oleada", chartTaken: "daño recibido", chartDealt: "daño infligido",
      dmgByTower: "Daño por tipo de torre",
      mutatorNext: "Mutador", eliteTag: "Élite",
      tierUp: (r, c) => `⬆ Rama Tier ${r} (${c} 💎)`, tierMax: "Rama al máximo", tierLbl: "Tier",
      evolveTitle: "⬆ Evolucionar", evolveFor: (c) => `Evolucionar (${c} 💎)`,
      upgradeFor: (c) => `⬆ Mejorar (${c} 💎)`, maxLevel: "Nivel máximo",
      sellFor: (c) => `🗑 Vender (+${c} 💎)`, prio: "🎯",
      prioCore: "Cercano al núcleo", prioStrong: "Más fuerte", prioWeak: "Más débil",
      lvl: "Nivel", kills: "bajas", clickUpgrade: (c) => `Clic: mejorar por ${c} 💎`,
      clickEvolve: "Clic: elegir evolución", rightSell: (c) => `Clic dcho: vender +${c} 💎 · T: prioridad`,
      dmgLabel: "Daño", rangeLabel: "Alcance", rateLabel: "Cadencia", dpsLabel: "DPS",
      noEnergy: "Energía insuficiente", noPlace: "No se puede construir aquí",
      needN: (c) => `Necesitas ${c} 💎`, sold: (c) => `+${c} 💎 vendida`,
      waveCleared: (c) => `+${c} 💎 oleada superada`, interest: (c) => `+${c} 💎 interés`,
      perfectWave: "✨ ¡Oleada perfecta! +25 💎", earlyBonus: (c) => `+${c} 💎 por adelantar`,
      towersStunned: "¡Torres aturdidas!", summons: "¡Invoca esbirros!", enraged: "¡SE ENFURECE!",
      overdrive: "🔥 ¡SOBRECARGA!", objLabel: "Objetivo",
      getReady: "¡PREPÁRATE!", getReadySub: (d) => `Dificultad ${d} — coloca tus torres y pulsa ▶`,
      bossComing: "¡Un jefe se acerca!", megaComing: "¡Un MEGA-JEFE se acerca!",
      endlessBanner: "♾ MODO INFINITO", endlessSub: "Las sombras no tienen fin… ¿y tu récord?",
      recovered: "Partida recuperada — prepárate para la siguiente",
      muted: "Silenciado", unmuted: "Sonido activado", volume: (v) => `Volumen ${v}%`,
      achievement: "Logro", fragsEarned: (n) => `+${n} 💠 fragmentos de geoda`,
      dailyRun: "📅 DESAFÍO DIARIO", dailySub: (s) => `Semilla ${s} — la misma caverna para todo el mundo`,
      dailyDone: (s) => `Desafío diario completado: ${s} puntos`,
      powerSpot: "Vetas de poder: +25% de daño construyendo encima",
      lockedWave: (n) => `Oleada ${n}`, ready: "Lista", tKey: "T",
      settingsTitle: "⚙ Ajustes",
      sShake: "Sacudida de pantalla", sReduced: "Movimiento reducido", sCb: "Modo daltónico",
      sTextScale: "Tamaño del texto flotante", sVolume: "Volumen", sLang: "Idioma / Language",
      sExport: "📤 Exportar progreso", sImport: "📥 Importar progreso",
      exportMsg: "Copia este código para llevarte tu progreso:",
      importMsg: "Pega aquí tu código de progreso:", importOk: "Progreso importado", importBad: "Código no válido",
      tutSkip: "Saltar tutorial ✕",
      tut1: "🔷 Elige un cristal abajo y haz <b>clic en el mapa</b> para construir tu primera torre.",
      tut2: "⬆ Haz <b>clic sobre tu torre</b> para mejorarla. Al nivel 5 podrá <b>evolucionar</b>.",
      tut3: "▶ Pulsa el botón o <b>Enter</b> para lanzar la oleada. Adelantarla da energía extra.",
      tut4: "⚡ Si te ves apurado usa el <b>Pulso (ESPACIO)</b>. Pasa el cursor por las gemas 💎 para recogerlas.",
      tutDone: "¡Tutorial completado! La caverna es tuya.",
      synergy: "Sinergias", empowered: "⛰ Potenciada por veta (+25% daño)",
      mapTitle: "Mapa", unlockTowers: "🔓 Torres especiales",
      unlockFor: (c) => `Desbloquear ${c} 💠`, unlockedLbl: "✓ Desbloqueada",
      playCode: "🎲 Jugar código", codePrompt: "Pega el código de partida (GEO-…):", codeBad: "Código no válido",
      runCode: "Código de esta partida (compártelo para retar):", copyCode: "🎲 Código de reto",
      saveCard: "🖼 Guardar tarjeta", recordLbl: "Récord",
      auraLabel: "Aura", minRangeLabel: "Alcance mín.",
      challengeBanner: "🎲 PARTIDA RETO", challengeSub: (s) => `Código ${s} — misma caverna, mismas oleadas`,
      campaignBtn: "🗻 Campaña", campaignTitle: "🗻 Campaña de la Caverna",
      campaignSub: "Niveles con reglas propias. ★ completar · ★★ núcleo ≥60% · ★★★ núcleo ≥95%",
      levelWaves: (n) => `${n} oleadas`, levelClear: "¡NIVEL SUPERADO!",
      nextLevel: "Siguiente nivel ▶", lockedLevel: "Supera el nivel anterior",
      editorBtn: "🛠 Editor", editorRock: "⛰ Roca", editorSpot: "✨ Veta", editorSize: "Tamaño",
      editorClear: "🗑 Limpiar", editorTest: "▶ Probar", editorExport: "📤 Código",
      editorImport: "📥 Importar", editorExit: "✕ Salir",
      editorHint: "Clic: colocar · Clic derecho: borrar",
      mapCode: "Código del mapa (compártelo):", mapCodePrompt: "Pega un código de mapa (GEOM-…):",
      ascTitle: "☄️ Ascensión", ascNone: "—",
      ascDesc: (n) => n === 0 ? "Sin modificadores" : `+${8 * n}% vida y +${2 * n}% velocidad enemiga · ×${(1 + 0.2 * n).toFixed(1)} puntuación`,
      ascUnlocked: (n) => `¡Ascensión ${n} desbloqueada!`,
      ascBanner: (n) => `☄️ Ascensión ${n}`,
      sentinelTitle: "🛡 El Centinela", novaReady: "Nova lista (G)", novaCd: (s) => `Nova ${s}s`,
      helpBody: [
        "<h3>Controles</h3>",
        "<kbd>Clic</kbd> colocar torre / mejorar / evolucionar &nbsp; <kbd>Clic dcho.</kbd> vender (60%) &nbsp; <kbd>1-6</kbd> elegir cristal &nbsp; <kbd>T</kbd> prioridad de la torre bajo el cursor<br>",
        "<kbd>Espacio</kbd> Pulso &nbsp; <kbd>Q</kbd> Tormenta &nbsp; <kbd>E</kbd> Escudo &nbsp; <kbd>R</kbd> Sobrecarga<br>",
        "<kbd>Enter</kbd> lanzar oleada &nbsp; <kbd>F</kbd> velocidad (1×/2×/3×) &nbsp; <kbd>P</kbd>/<kbd>Esc</kbd> pausa &nbsp; <kbd>M</kbd> silencio &nbsp; <kbd>+</kbd>/<kbd>-</kbd> volumen &nbsp; <kbd>H</kbd> esta ayuda",
        "<h3>Profundidad</h3>",
        "· Al <b>nivel 5</b> cada torre elige entre 2 <b>evoluciones</b> únicas.<br>",
        "· Las torres <b>vecinas</b> (a menos de 80 px) se dan <b>sinergias</b> según su tipo.<br>",
        "· Construir sobre una <b>veta de poder</b> ⛰ da +25% de daño.<br>",
        "· Cada 3 oleadas eliges una <b>reliquia</b>: un poder permanente para la partida.<br>",
        "· Algunas oleadas llegan con <b>mutadores</b>; míralos en la vista previa.<br>",
        "· Los <b>élites</b> dorados llevan afijos: regenerador, veloz o escudado.<br>",
        "· Cada jefe tiene identidad propia: el Devorador se enfurece, la Tejedora invoca, el Coloso se escuda.<br>",
        "· El <b>desafío diario</b> usa la misma semilla para todo el mundo: mismo terreno, mismas oleadas.<br>",
        "· El <b>Centinela</b> (desbloqueable) sigue tu cursor y dispara solo; pulsa <kbd>G</kbd> para su nova de escarcha.<br>",
        "· La partida se <b>guarda sola</b> entre oleadas.",
      ].join("\n"),
    },
    en: {
      tagline: "Defend the Core",
      intro: "The shadows come to devour the last geode core. Build crystals, draft relics and survive <b>25 waves</b>.",
      difficulty: "Difficulty", start: "START", cont: "⏵ CONTINUE", daily: "📅 Daily Challenge",
      dailyBest: "Today's best", settings: "⚙ Settings", shopTitle: "💠 Permanent Upgrades",
      achTitle: "🏆 Achievements", historyTitle: "📜 Recent runs", helpHint: "Press <b>H</b> in game to see all controls.",
      best: "Best score", fragments: "Fragments", totalKills: "Total kills",
      pause: "PAUSED", resume: "RESUME", restart: "Restart", menu: "Menu",
      helpTitle: "Cavern Guide", back: "BACK",
      nextWave: "▶ Next wave", firstWave: "▶ First wave", waveN: "Wave",
      shadowsLeft: (n) => `${n} shadows left`,
      defeat: "THE CORE HAS FALLEN", victoryT: "🏆 THE CAVERN IS SAFE!",
      victoryP: "You survived all 25 waves. The geode shines brighter than ever.",
      endless: "♾ ENDLESS MODE", retry: "RETRY",
      draftTitle: "✨ Choose a relic", draftSub: "A permanent power for this run",
      statWaves: "Waves", statScore: "Score", statKills: "Kills", statDmg: "Damage dealt",
      statTowers: "Towers built", statCrits: "Crits", statGems: "Gems collected", statPerfect: "Perfect waves",
      chartTitle: "Damage per wave", chartTaken: "damage taken", chartDealt: "damage dealt",
      dmgByTower: "Damage by tower type",
      mutatorNext: "Mutator", eliteTag: "Elite",
      tierUp: (r, c) => `⬆ Branch Tier ${r} (${c} 💎)`, tierMax: "Branch maxed", tierLbl: "Tier",
      evolveTitle: "⬆ Evolve", evolveFor: (c) => `Evolve (${c} 💎)`,
      upgradeFor: (c) => `⬆ Upgrade (${c} 💎)`, maxLevel: "Max level",
      sellFor: (c) => `🗑 Sell (+${c} 💎)`, prio: "🎯",
      prioCore: "Closest to core", prioStrong: "Strongest", prioWeak: "Weakest",
      lvl: "Level", kills: "kills", clickUpgrade: (c) => `Click: upgrade for ${c} 💎`,
      clickEvolve: "Click: choose evolution", rightSell: (c) => `Right-click: sell +${c} 💎 · T: priority`,
      dmgLabel: "Damage", rangeLabel: "Range", rateLabel: "Rate", dpsLabel: "DPS",
      noEnergy: "Not enough energy", noPlace: "Can't build here",
      needN: (c) => `You need ${c} 💎`, sold: (c) => `+${c} 💎 sold`,
      waveCleared: (c) => `+${c} 💎 wave cleared`, interest: (c) => `+${c} 💎 interest`,
      perfectWave: "✨ Perfect wave! +25 💎", earlyBonus: (c) => `+${c} 💎 early start`,
      towersStunned: "Towers stunned!", summons: "Summoning minions!", enraged: "ENRAGED!",
      overdrive: "🔥 OVERDRIVE!", objLabel: "Target",
      getReady: "GET READY!", getReadySub: (d) => `${d} difficulty — place your towers and press ▶`,
      bossComing: "A boss approaches!", megaComing: "A MEGA-BOSS approaches!",
      endlessBanner: "♾ ENDLESS MODE", endlessSub: "The shadows never end… does your record?",
      recovered: "Run recovered — get ready for the next wave",
      muted: "Muted", unmuted: "Sound on", volume: (v) => `Volume ${v}%`,
      achievement: "Achievement", fragsEarned: (n) => `+${n} 💠 geode fragments`,
      dailyRun: "📅 DAILY CHALLENGE", dailySub: (s) => `Seed ${s} — the same cavern for everyone`,
      dailyDone: (s) => `Daily challenge finished: ${s} points`,
      powerSpot: "Power veins: +25% damage when built on top",
      lockedWave: (n) => `Wave ${n}`, ready: "Ready", tKey: "T",
      settingsTitle: "⚙ Settings",
      sShake: "Screen shake", sReduced: "Reduced motion", sCb: "Colorblind mode",
      sTextScale: "Floating text size", sVolume: "Volume", sLang: "Idioma / Language",
      sExport: "📤 Export progress", sImport: "📥 Import progress",
      exportMsg: "Copy this code to take your progress with you:",
      importMsg: "Paste your progress code here:", importOk: "Progress imported", importBad: "Invalid code",
      tutSkip: "Skip tutorial ✕",
      tut1: "🔷 Pick a crystal below and <b>click the map</b> to build your first tower.",
      tut2: "⬆ <b>Click your tower</b> to upgrade it. At level 5 it can <b>evolve</b>.",
      tut3: "▶ Press the button or <b>Enter</b> to launch the wave. Starting early grants extra energy.",
      tut4: "⚡ In trouble? Use the <b>Pulse (SPACE)</b>. Hover over gems 💎 to collect them.",
      tutDone: "Tutorial complete! The cavern is yours.",
      synergy: "Synergies", empowered: "⛰ Empowered by vein (+25% damage)",
      mapTitle: "Map", unlockTowers: "🔓 Special towers",
      unlockFor: (c) => `Unlock ${c} 💠`, unlockedLbl: "✓ Unlocked",
      playCode: "🎲 Play code", codePrompt: "Paste a run code (GEO-…):", codeBad: "Invalid code",
      runCode: "This run's code (share it to challenge):", copyCode: "🎲 Challenge code",
      saveCard: "🖼 Save card", recordLbl: "Record",
      auraLabel: "Aura", minRangeLabel: "Min range",
      challengeBanner: "🎲 CHALLENGE RUN", challengeSub: (s) => `Code ${s} — same cavern, same waves`,
      campaignBtn: "🗻 Campaign", campaignTitle: "🗻 Cavern Campaign",
      campaignSub: "Levels with their own rules. ★ complete · ★★ core ≥60% · ★★★ core ≥95%",
      levelWaves: (n) => `${n} waves`, levelClear: "LEVEL CLEARED!",
      nextLevel: "Next level ▶", lockedLevel: "Beat the previous level",
      editorBtn: "🛠 Editor", editorRock: "⛰ Rock", editorSpot: "✨ Vein", editorSize: "Size",
      editorClear: "🗑 Clear", editorTest: "▶ Test", editorExport: "📤 Code",
      editorImport: "📥 Import", editorExit: "✕ Exit",
      editorHint: "Click: place · Right-click: erase",
      mapCode: "Map code (share it):", mapCodePrompt: "Paste a map code (GEOM-…):",
      ascTitle: "☄️ Ascension", ascNone: "—",
      ascDesc: (n) => n === 0 ? "No modifiers" : `+${8 * n}% enemy HP and +${2 * n}% speed · ×${(1 + 0.2 * n).toFixed(1)} score`,
      ascUnlocked: (n) => `Ascension ${n} unlocked!`,
      ascBanner: (n) => `☄️ Ascension ${n}`,
      sentinelTitle: "🛡 The Sentinel", novaReady: "Nova ready (G)", novaCd: (s) => `Nova ${s}s`,
      helpBody: [
        "<h3>Controls</h3>",
        "<kbd>Click</kbd> place / upgrade / evolve &nbsp; <kbd>Right-click</kbd> sell (60%) &nbsp; <kbd>1-6</kbd> pick crystal &nbsp; <kbd>T</kbd> targeting priority under cursor<br>",
        "<kbd>Space</kbd> Pulse &nbsp; <kbd>Q</kbd> Storm &nbsp; <kbd>E</kbd> Shield &nbsp; <kbd>R</kbd> Overdrive<br>",
        "<kbd>Enter</kbd> launch wave &nbsp; <kbd>F</kbd> speed (1×/2×/3×) &nbsp; <kbd>P</kbd>/<kbd>Esc</kbd> pause &nbsp; <kbd>M</kbd> mute &nbsp; <kbd>+</kbd>/<kbd>-</kbd> volume &nbsp; <kbd>H</kbd> this help",
        "<h3>Depth</h3>",
        "· At <b>level 5</b> each tower picks one of 2 unique <b>evolutions</b>.<br>",
        "· <b>Neighboring</b> towers (within 80 px) grant type-based <b>synergies</b>.<br>",
        "· Building on a <b>power vein</b> ⛰ grants +25% damage.<br>",
        "· Every 3 waves you draft a <b>relic</b>: a run-long power.<br>",
        "· Some waves arrive with <b>mutators</b>; check the preview.<br>",
        "· Golden <b>elites</b> carry affixes: regenerating, swift or shielded.<br>",
        "· Each boss has its own identity: the Devourer enrages, the Weaver summons, the Colossus shields.<br>",
        "· The <b>daily challenge</b> uses one seed for everyone: same terrain, same waves.<br>",
        "· The <b>Sentinel</b> (unlockable) follows your cursor and auto-fires; press <kbd>G</kbd> for its frost nova.<br>",
        "· Your run <b>auto-saves</b> between waves.",
      ].join("\n"),
    },
  };

  return {
    mulberry32, seedFromDate,
    DIFFICULTIES, TOWER_TYPES, TOWER_ORDER, EVOLUTIONS, EVOLUTION_COST,
    SYNERGIES, SYNERGY_RADIUS,
    ENEMY_TYPES, ENEMY_ICONS, ENEMY_COLORS_CB,
    BOSS_KINDS, BOSS_ROTATION, bossKindForWave,
    ELITE_AFFIXES, MUTATORS, MUTATOR_CHANCE, MUTATOR_MIN_WAVE,
    RELICS, RELIC_INTERVAL, LAYOUTS, LAYOUT_ORDER,
    CAMPAIGN, STAR_THRESHOLDS, STAR_REWARD, ASCENSION, SENTINEL, EVO_TIER,
    ABILITIES, SHOP, shopCost, ACHIEVEMENTS,
    ECON, waveComposition, STRINGS,
  };
});
