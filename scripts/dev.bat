@echo off
cd /d "%~dp0.."

echo Starting Vite dev server...
start /b cmd /c "node node_modules\vite\bin\vite.js"

echo Waiting for Vite...
timeout /t 4 /nobreak >nul

echo Starting Electron...
set NODE_ENV=development
start "" "node_modules\.bin\electron.cmd" . --no-sandbox

echo Done!
