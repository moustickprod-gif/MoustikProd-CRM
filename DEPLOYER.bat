@echo off
chcp 65001 >nul
echo.
echo  ============================================
echo   Moustikprod CRM — Deploiement Vercel
echo  ============================================
echo.

echo  Verification de la connexion Vercel...
vercel whoami >nul 2>&1
if %errorlevel% neq 0 (
  echo.
  echo  ERREUR : Vous n'etes pas connecte a Vercel.
  echo  Lancez d'abord : vercel login
  echo.
  pause
  exit /b 1
)

for /f "tokens=*" %%u in ('vercel whoami') do set VERCEL_USER=%%u
echo  Connecte en tant que : %VERCEL_USER%
echo.
echo  Deploiement en production sur :
echo  https://moustikprod-crm.vercel.app
echo.
echo  Appuyez sur une touche pour continuer...
pause >nul

vercel --prod

echo.
echo  ============================================
echo  Deploiement termine !
echo  Site disponible sur :
echo  https://moustikprod-crm.vercel.app
echo  ============================================
echo.
pause
