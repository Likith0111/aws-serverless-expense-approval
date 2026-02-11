# Start SpendGuard frontend development server (PowerShell)

Set-Location frontend

Write-Host "Installing frontend dependencies..." -ForegroundColor Cyan
npm install

Write-Host "Starting frontend development server on port 3000..." -ForegroundColor Green
npm run dev
