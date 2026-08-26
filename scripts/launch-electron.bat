@echo off
cd /d "%~dp0.."
set NODE_ENV=development
start "" "%~dp0..\node_modules\.bin\electron.cmd" . --no-sandbox
