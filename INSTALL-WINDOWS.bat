@echo off
chcp 65001 >nul
echo.
echo  ============================================
echo   Moustikprod CRM — Installation Windows
echo  ============================================
echo.

echo [1/3] Verification de Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
  echo.
  echo  ERREUR : Node.js n'est pas installe !
  echo.
  echo  Telechargez-le sur : https://nodejs.org
  echo  Choisissez la version LTS, installez-le,
  echo  puis relancez ce script.
  echo.
  pause
  exit /b 1
)

for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
echo  OK - Node.js %NODE_VER% detecte

echo.
echo [2/3] Installation de Vercel CLI...
npm install -g vercel
if %errorlevel% neq 0 (
  echo  ERREUR lors de l'installation de Vercel CLI.
  echo  Verifiez votre connexion internet et reessayez.
  pause
  exit /b 1
)
echo  OK - Vercel CLI installe

echo.
echo [3/3] Verification de l'installation...
vercel --version >nul 2>&1
if %errorlevel% neq 0 (
  echo  ATTENTION : Vercel CLI semble mal installe.
  echo  Fermez ce terminal, ouvrez-en un nouveau et tapez : vercel --version
) else (
  for /f "tokens=*" %%v in ('vercel --version') do set VERCEL_VER=%%v
  echo  OK - Vercel %VERCEL_VER%
)

echo.
echo  ============================================
echo   Installation terminee !
echo  ============================================
echo.
echo  Prochaine etape :
echo  Ouvrez un terminal (cmd) dans ce dossier et tapez :
echo.
echo    vercel login
echo.
echo  Connectez-vous avec : moustickprod@gmail.com
echo  (Les variables d'environnement Vercel seront
echo   automatiquement disponibles apres connexion)
echo.
pause
