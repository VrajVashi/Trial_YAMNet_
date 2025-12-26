@echo off
echo Starting Silent Sentinel...
cd server
if not exist node_modules (
    echo Installing dependencies...
    call npm install
)
echo Starting Node.js Server on Port 3000...
node server.js
pause
