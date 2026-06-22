@echo off
chcp 65001 >nul
echo.
echo  ============================================
echo   Moustikprod CRM — Serveur local
echo  ============================================
echo.
echo  Demarrage du serveur sur http://localhost:3000
echo  (Appuyez sur Ctrl+C pour arreter)
echo.
echo  RAPPEL : Les fonctions /api/ ne fonctionnent
echo  pas en local. Pour les tester, utilisez :
echo    vercel dev
echo  (ou deployer en preview avec : vercel)
echo.
echo  Ouverture dans Chrome dans 3 secondes...
timeout /t 3 /nobreak >nul
start chrome http://localhost:3000
echo.
node server.js
echo.
echo  Serveur arrete.
pause
