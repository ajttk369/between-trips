@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 24.x를 먼저 설치해주세요.
  pause
  exit /b 1
)
if not exist "node_modules\leaflet\dist\leaflet.js" (
  set NODE_USE_SYSTEM_CA=1
  call npm ci --no-audit --no-fund --cache .npm-cache
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
echo 브라우저에서 http://localhost:4310 에 접속해주세요.
node --use-system-ca --env-file-if-exists=.env server.mjs
pause
