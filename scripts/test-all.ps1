# Run all tests (backend + frontend) - PowerShell

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Running Backend Tests" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
npm test

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Running Frontend Tests" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Set-Location frontend
npm install
npm test

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "All tests completed!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
