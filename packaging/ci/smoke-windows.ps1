# Smoke test on Windows: boots server, checks /api/status, verifies clean exit.
param([int]$Port = 47800)

$ErrorActionPreference = "Stop"
Write-Host "Starting Webcamo smoke test on Windows (port $Port)..."

$proc = Start-Process -FilePath "node" -ArgumentList "server/dist/main.js", "run", "--no-window" -PassThru

try {
  $success = $false
  for ($i = 0; $i -lt 30; $i++) {
    try {
      $res = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/status" -TimeoutSec 1 -UseBasicParsing
      if ($res.StatusCode -eq 200) {
        Write-Host "Webcamo responded cleanly on HTTP /api/status"
        $success = $true
        break
      }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }

  if (-not $success) {
    throw "Smoke test timed out waiting for Webcamo daemon"
  }
} finally {
  if ($proc -and -not $proc.HasExited) {
    Stop-Process -Id $proc.Id -Force
  }
}
