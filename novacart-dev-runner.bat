@echo off
cd /d "F:\projects\novacart"
npm run dev > "%~dp0novacart-dev.log" 2>&1
