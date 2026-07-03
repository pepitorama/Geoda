# 💎 GEODA — Defiende el Núcleo

Un juego de **defiende tu base** (tower defense) hecho en HTML5 Canvas puro.
Sin dependencias, sin build: abre `index.html` en el navegador y juega.

En lo profundo de la caverna late el último **núcleo de geoda**. Las sombras
vienen a devorarlo desde todos los flancos — construye torres de cristal y
resiste tantas oleadas como puedas.

## 🎮 Cómo jugar

| Acción | Control |
|---|---|
| Colocar torre | Clic en el mapa |
| Mejorar torre (hasta nivel 4) | Clic sobre la torre |
| Vender torre (recuperas 60%) | Clic derecho sobre la torre |
| Elegir tipo de cristal | Teclas `1`-`4` o la barra inferior |
| Pulso de choque de emergencia | `ESPACIO` (25s de recarga) |
| Lanzar la siguiente oleada | `Enter` o el botón ▶ |
| Pausa | `P` |
| Silenciar música y sonido | `M` |

## 🔷 Torres de cristal

- **🔴 Rubí** (60 💎) — disparo rápido a un objetivo.
- **🔵 Zafiro** (80 💎) — ralentiza a los enemigos un 50%.
- **🟢 Esmeralda** (110 💎, se desbloquea en la oleada 2) — daño en área.
- **🟡 Ámbar** (150 💎, se desbloquea en la oleada 4) — francotirador de largo alcance.

## 👾 Enemigos

- **Mota** — la sombra básica.
- **Veloz** — rápido pero frágil.
- **Bruto** — lento, aguanta muchísimo.
- **Divisor** — al morir se parte en dos.
- **Espectro** (desde la oleada 6) — se vuelve intangible por fases; los
  proyectiles lo atraviesan, pero el pulso de choque siempre le acierta.
- **Jefe** — cada 5 oleadas. Prepárate.

## ✨ Detalles

- **Combos**: encadena bajas en menos de ~2s para multiplicar la puntuación (hasta x5).
- El núcleo se regenera un poco al superar cada oleada.
- La mejor puntuación se guarda en `localStorage`.
- Sonido y música ambiental generados al vuelo con WebAudio — cero archivos de audio.

Hecho con cariño, canvas y muchas partículas. 💜
