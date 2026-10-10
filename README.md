# CRYOSIGHT

CRYOSIGHT is a light-theme quantum cryogenic digital-twin dashboard. The React client includes interactive stage inspection, cryostat and QPU visualizations, telemetry analytics, fault injection, and a QAOA lab. A FastAPI service supplies simulated cryogenic telemetry and runs a four-variable QUBO through Qiskit Optimization and Qiskit Aer.

> **Simulation notice:** all telemetry, fault scenarios, and quantum measurements are simulated. This project does not control or connect to physical cryogenic or quantum hardware.

## Repository layout

```text
frontend/
  src/
    components/
    types/
    utils/
  package.json
  vite.config.ts
backend/
  main.py
  qiskit_simulator.py
  requirements.txt
README.md
```

## Requirements

- Node.js 20 or newer and npm
- Python 3.11 or newer

## Run locally on Windows

Open two PowerShell terminals in the project root.

### 1. Install and run the backend

```powershell
Set-Location backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

FastAPI health check: <http://127.0.0.1:8000/api/health>  
Interactive API docs: <http://127.0.0.1:8000/docs>

For a supervised backend that restarts after an unexpected Uvicorn exit, use
`.\start_backend.ps1` from the `backend` directory. It runs a single worker
without file watching and limits common native math-library thread counts.
To launch that supervisor hidden from the project root:

```powershell
$backend = (Resolve-Path .\backend).Path
$script = '"' + (Join-Path $backend 'start_backend.ps1') + '"'
Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" `
  -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File $script" `
  -WorkingDirectory $backend -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $backend 'uvicorn.stdout.log') `
  -RedirectStandardError (Join-Path $backend 'uvicorn.stderr.log')
```

Unexpected Python exceptions are logged and returned as JSON errors. This
cannot recover from an OS-level process termination, native crash, or OOM kill;
the PowerShell supervisor restarts Uvicorn after an exit. QAOA is limited to
four qubits, at most 8192 shots, one simulator request at a time, and
single-threaded Aer execution.

### 2. Install and run the frontend

```powershell
Set-Location frontend
npm install
npm run dev
```

Open <http://localhost:3000>. Vite listens on port 3000 and the frontend reads `VITE_API_URL` from `frontend/.env` (default: `http://127.0.0.1:8000`). The dashboard shows an explicit API connection state if the backend has not been started or cannot be reached.

## Features

- Dashboard cards for vacuum pressure, qubit count, MXC temperature, thermal load and margin, system health, anomaly score, and cooling cells
- Cryostat stage thermal table, payload controls, selectable stage inspector, and 3D system views
- Live backend telemetry polling and simulated fault injection
- Interactive telemetry and analytics visualizations
- One-layer QAOA circuit simulation using Qiskit Aer, with the cryogenic heat-vs-margin QUBO mapped to an Ising operator through Qiskit Optimization
- FastAPI endpoints: `GET /api/health`, `GET /api/telemetry`, `POST /api/fault-injection`, and `POST /api/qaoa`

## Development checks

```powershell
Set-Location frontend
npm run lint
npm run build
```

To call QAOA directly:

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/api/qaoa `
  -ContentType "application/json" -Body '{"gamma":1.25,"beta":0.85,"shots":1024}'
```
