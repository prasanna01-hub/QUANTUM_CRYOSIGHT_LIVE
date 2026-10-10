param(
    [int]$Port = 8000,
    [int]$RestartDelaySeconds = 3
)

$ErrorActionPreference = 'Stop'
$python = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'

if (-not (Test-Path -LiteralPath $python)) {
    throw "Backend virtual environment not found at '$python'. Create it and install requirements.txt first."
}

$existingListener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
    Select-Object -First 1
if ($existingListener) {
    throw "Port $Port is already owned by PID $($existingListener.OwningProcess). Stop that process before starting CRYOSIGHT."
}

$env:OMP_NUM_THREADS = '1'
$env:OPENBLAS_NUM_THREADS = '1'
$env:MKL_NUM_THREADS = '1'
$env:NUMEXPR_NUM_THREADS = '1'

while ($true) {
    Write-Host "Starting CRYOSIGHT FastAPI on http://127.0.0.1:$Port (reload disabled, one worker)."
    & $python -m uvicorn main:app --host 127.0.0.1 --port $Port --workers 1
    $exitCode = $LASTEXITCODE

    if ($exitCode -eq 0) {
        Write-Host 'Uvicorn exited normally; stopping supervisor.'
        break
    }

    Write-Warning "Uvicorn exited with code $exitCode. Restarting in $RestartDelaySeconds seconds. Review uvicorn.stderr.log."
    Start-Sleep -Seconds $RestartDelaySeconds
}
