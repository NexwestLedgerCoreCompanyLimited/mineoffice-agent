@echo off
cd /d "%~dp0"
echo Starting MineOffice Agent Studio...
start "" "node_modules\electron\dist\electron.exe" .
