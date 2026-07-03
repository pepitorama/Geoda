# 💎 GEODA — Defiende el Núcleo · v2 «Edición Profunda»

Un juego de **defiende tu base** (tower defense) hecho en HTML5 Canvas puro.
Sin dependencias, sin build: abre `index.html` en el navegador y juega.

En lo profundo de la caverna late el último **núcleo de geoda**. Las sombras
vienen a devorarlo desde todos los flancos — construye cristales, domina las
habilidades y sobrevive **25 oleadas** para salvar la caverna… o sigue en
modo infinito.

## 🎮 Controles

| Acción | Control |
|---|---|
| Colocar torre | Clic en el mapa |
| Mejorar torre (hasta nivel 5) | Clic sobre la torre |
| Vender torre (recuperas 60%) | Clic derecho sobre la torre |
| Cambiar prioridad de objetivo | `T` con el cursor sobre la torre |
| Elegir tipo de cristal | Teclas `1`-`6` o la barra inferior |
| Pulso / Tormenta / Escudo / Sobrecarga | `Espacio` / `Q` / `E` / `R` |
| Lanzar la siguiente oleada | `Enter` o el botón ▶ (da energía extra) |
| Pausa | `P` o `Esc` |
| Ayuda completa | `H` |
| Silencio / volumen | `M` / `+` `-` |

También es jugable en **pantallas táctiles**: toca una torre para abrir su
menú de mejora/venta/prioridad.

## 🔷 Torres de cristal

- **🔴 Rubí** (60 💎) — disparo rápido a un objetivo.
- **🔵 Zafiro** (80 💎) — ralentiza a los enemigos un 50%.
- **🟢 Esmeralda** (110 💎, oleada 2) — daño en área.
- **🟣 Amatista** (130 💎, oleada 3) — rayo que encadena hasta 4 enemigos.
- **🟡 Ámbar** (150 💎, oleada 4) — francotirador que perfora hasta 3 enemigos.
- **⚪ Diamante** (200 💎, oleada 6) — láser continuo que se intensifica sobre el mismo objetivo.

Las torres asestan **críticos** (10%, daño ×2), ganan **veteranía** (+2% de
daño por cada 10 bajas) y tienen **prioridad de objetivo** configurable
(cercano al núcleo / más fuerte / más débil).

## ⚡ Habilidades del núcleo

- **Pulso** (`Espacio`) — onda expansiva que daña y empuja.
- **Tormenta** (`Q`, oleada 3) — 12 meteoros de cristal.
- **Escudo** (`E`, oleada 5) — 4 s de invulnerabilidad que repele atacantes.
- **Sobrecarga** (`R`, oleada 8) — todas las torres disparan al doble de velocidad 6 s.

## 👾 Bestiario

Mota · Veloz · Bruto · Divisor (se parte en dos) · **Sanador** (regenera a los
cercanos) · **Espectro** (intangible por fases) · **Blindado** (inmune a
ralentización y críticos) · **Excavador** (viaja bajo tierra y emerge junto al
núcleo) · **Élites dorados** (doble vida, doble botín) · **Jefe** cada 5
oleadas (aturde torres con su pulso oscuro) · **Mega-jefe** cada 10 oleadas
(invoca esbirros).

## 💠 Meta-progresión

- Cada partida otorga **fragmentos de geoda** que persisten entre sesiones.
- Gástalos en la **tienda de mejoras permanentes**: vida del núcleo, energía
  inicial, daño, recarga de habilidades y descuento de torres.
- **12 logros** con recompensa en fragmentos.
- **3 dificultades** (Relajado / Normal / Pesadilla) que escalan enemigos,
  economía y multiplicador de puntuación.
- **Guardado automático** entre oleadas: cierra el navegador y continúa después.

## 💰 Economía

Botín por baja · gemas coleccionables con el cursor · +5% de **interés** al
superar cada oleada · bonus de **oleada perfecta** · bonus por **adelantar**
la oleada · **combos** de bajas encadenadas que multiplican la puntuación
hasta ×5.

## ✨ Técnica

- Canvas 2D con partículas, ondas expansivas, viñeta de daño, grietas en el
  núcleo, portales de aparición, luciérnagas ambientales y tinte de caverna
  que evoluciona con las oleadas.
- Sonido y **música ambiental por capas** (se intensifica con los jefes)
  generados al vuelo con WebAudio — cero archivos de audio.
- Pausa automática al cambiar de pestaña. Sin dependencias externas.

Hecho con cariño, canvas y muchas partículas. 💜
