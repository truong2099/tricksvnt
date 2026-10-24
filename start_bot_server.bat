@echo off
title Telegram Bot Manager Server - Port 8080
cd /d "%~dp0"
echo ====================================================
echo Starting Telegram Bot Manager & Server on port 8080...
echo Trang quan tri: https://vasnet360.site/telegram-bot-manager.html
echo Hoac cuc bo:    http://localhost:8080/telegram-bot-manager.html
echo ====================================================
start http://localhost:8080/telegram-bot-manager.html
node serve.js
pause
