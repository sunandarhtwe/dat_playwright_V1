@echo off
cd /d "%~dp0"
start "" /min node runner\server.js
exit
