@echo off
echo Building React application...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo Build failed!
    exit /b 1
)
echo.
echo Creating deployment zip...
node create-deployment-zip.js
pause





