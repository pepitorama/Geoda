# 💎 GEODA — Defiende el Núcleo · v8 «Edición Leyenda»

Mecánicas inspiradas en los grandes del género (Kingdom Rush, Bloons TD 6,
Plants vs Zombies):

- **🛡️ El Centinela sube de nivel** como un héroe: gana experiencia con cada
  baja y escala hasta el nivel 5, aumentando daño y alcance y acortando la
  recarga de su nova (progresión de héroe estilo Bloons/Kingdom Rush).
- **❤️‍🔥 Reliquia Núcleo Fénix**: una red de seguridad única — cuando el
  núcleo caería, revive al 35% y arrasa el mapa con un pulso enorme (como los
  cortacéspedes de Plants vs Zombies).
- **◈ Guardián de sombra**: un enemigo de apoyo que **escuda periódicamente a
  las sombras cercanas** (absorben impactos), obligándote a priorizarlo — el
  clásico "mata primero al de apoyo" de Kingdom Rush y Bloons.



Un juego de **defiende tu base** (tower defense) hecho en HTML5 Canvas puro.
Sin dependencias, sin build: abre `index.html` en el navegador y juega.
En español e inglés, en escritorio y táctil. Instalable como **PWA** con
juego sin conexión cuando se sirve por HTTP.

## 🆕 Novedades de la v7

- **🛡️ El Centinela** (desbloqueable con fragmentos): un **guardián que sigue
  tu cursor y dispara solo** durante las oleadas — el ratón pasa a tener doble
  uso (mover = dirigir al guardián, clic = construir). Ralentiza a lo que
  golpea y tiene su propia **nova de escarcha** con la tecla `G`. Añade una
  capa de juego *activo* encima del tower defense clásico.
- **Avance rápido 1×/2×/3×** (botón arriba a la derecha o tecla `F`).
- Logro nuevo (Guardián). No altera el equilibrio de quien no lo compre.

## Novedades de la v6

- **🛠 Editor de mapas**: diseña tu propia caverna colocando rocas (con
  tamaño ajustable) y vetas de poder, pruébala al instante y compártela con
  un **código `GEOM-…`** que reproduce el terreno en cualquier pantalla.
- **☄️ Ascensión (new game+)**: al ganar en modo libre desbloqueas hasta 10
  niveles de Ascensión que endurecen a los enemigos (+8% vida y +2%
  velocidad por nivel) a cambio de ×1,2 de puntuación por nivel.
- **2 logros nuevos** (Arquitecto y Ascendido — 20 en total).

## Novedades de la v5

- **🗻 Campaña de la Caverna**: 9 niveles diseñados a mano con reglas
  propias — torres prohibidas, presupuesto ajustado, núcleo frágil, niebla
  o frenesí permanentes, la muralla circular de **El Anillo** y el asalto
  final de 15 oleadas de *El corazón del abismo*. Desbloqueo secuencial.
- **Sistema de estrellas**: ★ completar · ★★ núcleo ≥60% · ★★★ núcleo
  ≥95%, con fragmentos por cada estrella nueva y botón «Siguiente nivel».
- **Mapa Anillo** exclusivo de campaña: muralla circular con tres brechas
  y vetas de poder junto a cada una.
- **2 logros nuevos** (Conquistador y Perfeccionista — 18 en total) y la
  campaña se integra con guardado automático, historial y tarjeta.

## Novedades de la v4

- **Torres especiales desbloqueables con fragmentos**: el **🫧 Ópalo**
  (soporte: su aura da +15% daño y +8% cadencia; evoluciona a Faro o
  Prospector) y la **⚫ Obsidiana** (mortero balístico de gran explosión con
  alcance mínimo; evoluciona a Magma —charcos ardientes— o Sísmica).
- **4 mapas**: Caverna, **Desfiladero** (murallas que canalizan a las
  sombras por un corredor, +15% puntuación), **Archipiélago** (apenas hay
  sitio para construir) y **Vacío** (campo abierto sin ayudas).
- **Códigos de reto**: cada partida tiene un código `GEO-…` que reproduce
  su semilla, mapa y dificultad. Compártelo y compite con la misma caverna.
- **Tarjeta de resultado**: descarga un PNG con tu puntuación, gráfico de
  la partida y el código de reto.
- **Récords por dificultad × mapa** y 4 logros nuevos (16 en total).
- **PWA**: manifest + service worker con cache-first para jugar offline.

En lo profundo de la caverna late el último **núcleo de geoda**. Construye
cristales, evoluciónalos, elige reliquias y sobrevive **25 oleadas** — o
compite en el desafío diario con la misma semilla que todo el mundo.

## 🗂 Arquitectura

| Archivo | Papel |
|---|---|
| `data.js` | **Fuente única de verdad**: definiciones, fórmulas de balance, textos ES/EN y PRNG determinista (UMD: navegador + Node) |
| `game.js` | Motor: simulación, render, UI, audio, guardado |
| `index.html` | Presentación y estilos |
| `tools/balance-sim.js` | Simulador de balance headless (`node tools/balance-sim.js [dificultad] [oleadas]`) |
| `manifest.webmanifest` + `sw.js` + `icon.svg` | PWA instalable con juego sin conexión |

## 🌊 Profundidad de juego

- **Evoluciones**: al nivel 5, cada torre elige 1 de 2 especializaciones
  únicas (12 en total): quemadura, disparo doble, congelación, aura de
  vórtice, nova, esporas, superconductor, estática, ejecutor, balista,
  prisma y foco.
- **Sinergias de adyacencia**: cada tipo de torre potencia a sus vecinas
  (daño, cadencia, alcance, crítico, daño crítico o inmunidad al
  aturdimiento). Los enlaces se visualizan al colocar y al inspeccionar.
- **Reliquias**: cada 3 oleadas eliges 1 de 3 poderes permanentes de la
  partida (12 en el pool: imán de gemas, eco del pulso, pirotecnia…).
- **Mutadores de oleada**: algunas oleadas llegan con afijos (Enjambre,
  Frenesí, Niebla, Avaricia…) anunciados en la vista previa.
- **Terreno procedural**: formaciones rocosas que bloquean la construcción y
  desvían a las sombras, y **vetas de poder** ⛰ que dan +25% de daño a la
  torre construida encima.
- **Jefes con identidad**: el **Devorador** se enfurece, la **Tejedora**
  invoca, el **Coloso** se escuda por impactos — además del mega-jefe cada
  10 oleadas. Todos aturden torres con su pulso oscuro.
- **Élites con afijo**: regenerador, veloz o escudado, con su icono encima.
- **Desafío diario**: semilla derivada de la fecha → mismo terreno, mismas
  oleadas, mismos mutadores y élites para todo el mundo, con récord propio.

## 🖥 Ingeniería

- **PRNG con semilla** (mulberry32): la estructura de la partida (terreno,
  composición y orden de oleadas, mutadores, élites) es determinista por
  semilla; el ruido cosmético usa `Math.random`.
- **Rejilla espacial** (spatial hash) para búsquedas de objetivos,
  salpicaduras, cadenas y auras: mantiene el coste por debajo de O(n²) con
  cientos de sombras.
- **Object pooling de partículas** con presupuesto adaptativo según los FPS
  medidos (EMA).
- **HiDPI**: render nítido en pantallas retina vía `devicePixelRatio`.
- **Simulador de balance headless** que consume las mismas fórmulas que el
  juego y reporta la curva de dificultad oleada a oleada (margen DPS,
  fugas, vida del núcleo). Las decisiones de balance del repositorio están
  ajustadas con él.
- **i18n completo ES/EN** conmutable en caliente desde ajustes.
- **Guardado versionado** entre oleadas + **exportar/importar progreso**
  como código copiable.
- **Accesibilidad**: modo daltónico (paleta Okabe-Ito para enemigos),
  movimiento reducido, sacudida de pantalla desactivable y tamaño del texto
  flotante configurable.
- **Tutorial interactivo** de 4 pasos en la primera partida.
- **Estadísticas post-partida**: gráfica de daño infligido/recibido por
  oleada y desglose de daño por tipo de torre, más historial de las últimas
  8 partidas en el menú.

## ▶️ Cómo ejecutarlo en tu ordenador

1. Descarga el repositorio (botón verde **Code → Download ZIP**) y **extrae el
   ZIP** a una carpeta normal (p. ej. el Escritorio) — no lo abras desde dentro
   del propio ZIP.
2. **Windows**: doble clic en **`Jugar-GEODA.bat`**. **Mac/Linux**: ejecuta
   `bash jugar.sh`. El servidor arranca y el navegador se abre solo en
   `http://localhost:8000`.
3. Para salir, cierra la ventana negra (o `Ctrl+C`).

> ¿Sin Python? También puedes **hacer doble clic en `index.html`** y jugar
> directamente (la única diferencia es que no se instala como app offline).

## 🎮 Controles

`Clic` construir/mejorar/evolucionar · `Clic dcho.` vender · `1-6` cristal ·
`T` prioridad · `Espacio/Q/E/R` habilidades · `Enter` oleada · `P`/`Esc`
pausa · `M` silencio · `+/-` volumen · `H` ayuda completa.

## ⚖️ Balance

```
node tools/balance-sim.js normal 30
node tools/balance-sim.js pesadilla 25
```

El modelo compra Rubíes de forma codiciosa con una cobertura del mapa del
55% y compara su DPS con la vida total de cada oleada dentro de la ventana
de viaje de las sombras. Normal mantiene un margen ≈3,5× con
estrangulamientos ≈2× en jefes; Pesadilla entra en déficit en los jefes y
exige habilidades, reliquias y sinergias.

Hecho con cariño, canvas y muchas partículas. 💜
