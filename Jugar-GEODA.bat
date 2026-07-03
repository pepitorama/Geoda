@echo off
title GEODA - servidor local
cd /d "%~dp0"

rem Busca Python (probando los nombres habituales en Windows)
set "PY="
where python3 >nul 2>nul && set "PY=python3"
if not defined PY ( where python >nul 2>nul && set "PY=python" )
if not defined PY ( where py >nul 2>nul && set "PY=py" )

if not defined PY (
  echo.
  echo   No se encontro Python en tu equipo.
  echo   Instalalo desde https://www.python.org  ^(marca "Add to PATH"^)
  echo   y vuelve a abrir este archivo.
  echo.
  pause
  exit /b
)

echo.
echo   ============================================
echo     GEODA - Defiende el Nucleo
echo     Servidor local: http://localhost:8000
echo   ============================================
echo.
echo   Abriendo el juego en tu navegador...
echo   NO cierres esta ventana mientras juegas.
echo   Para salir: pulsa Ctrl+C o cierra la ventana.
echo.

start "" http://localhost:8000
%PY% -m http.server 8000
