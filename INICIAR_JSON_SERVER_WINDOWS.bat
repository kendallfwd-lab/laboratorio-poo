@echo off
cd /d "%~dp0"
echo Iniciando JSON Server en http://127.0.0.1:3001/facturas
call npm run db
pause
