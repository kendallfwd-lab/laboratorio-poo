@echo off
cd /d "%~dp0"
echo Iniciando n8n en http://localhost:5678
call npm run n8n
pause
