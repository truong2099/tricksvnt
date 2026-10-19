@echo off
title ChungChi Store Server - Neobrutalism UI
echo ========================================================
echo    CHUNGCHI STORE - KHO CHUNG CHI & KY IPA ONLINE
echo    Giao dien: Neobrutalism (temp-mail.vasnet360.site)
echo    Ket noi API: https://chungchi.store/api/v1 (Live)
echo    Dang khoi chay tai: http://localhost:8080
echo ========================================================
start http://localhost:8080
python server.py
pause
