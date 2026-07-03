#!/usr/bin/env bash
# Lanzador de GEODA para Mac / Linux: arranca el servidor y abre el navegador.
cd "$(dirname "$0")" || exit 1

PY=""
command -v python3 >/dev/null 2>&1 && PY=python3
[ -z "$PY" ] && command -v python >/dev/null 2>&1 && PY=python
if [ -z "$PY" ]; then
  echo "No se encontro Python. Instalalo desde https://www.python.org"
  exit 1
fi

echo "GEODA - servidor local en http://localhost:8000"
echo "No cierres esta ventana mientras juegas. Ctrl+C para salir."

# Abre el navegador (macOS: open, Linux: xdg-open) sin bloquear
( sleep 1; (command -v open >/dev/null 2>&1 && open http://localhost:8000) || (command -v xdg-open >/dev/null 2>&1 && xdg-open http://localhost:8000) ) &

exec "$PY" -m http.server 8000
