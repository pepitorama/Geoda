# 💎 GEODA — Defiende el Núcleo · v3 «Edición Abisal»

Un juego de **defiende tu base** (tower defense) hecho en HTML5 Canvas puro.
Sin dependencias, sin build: abre `index.html` en el navegador y juega.
En español e inglés, en escritorio y táctil.

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
