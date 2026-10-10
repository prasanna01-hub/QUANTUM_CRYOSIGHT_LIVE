"""FastAPI endpoints for CRYOSIGHT's simulated cryogenic digital twin."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from qiskit_simulator import QaoaSimulationError, run_qaoa

FaultType = Literal[
    "temp_spike",
    "cooling_degradation",
    "cable_heat",
    "qubit_noise",
]

logger = logging.getLogger("cryosight.api")
qaoa_slots = asyncio.Semaphore(1)

FAULTS: dict[str, dict[str, str | float]] = {
    "temp_spike": {
        "title": "Mixing Chamber Temperature Spike",
        "parameter": "MXC temperature",
        "baseline": "8.2 mK",
        "current": "13.8 mK",
        "severity": "HIGH",
        "affected_stage": "mxc",
        "explanation": "A simulated heater transient raised the mixing-chamber temperature.",
        "mitigation": "Reduce heater drive and verify the dilution circulation rate.",
    },
    "cooling_degradation": {
        "title": "Cooling Degradation",
        "parameter": "Cooling power",
        "baseline": "44 µW",
        "current": "28 µW",
        "severity": "HIGH",
        "affected_stage": "mxc",
        "explanation": "A simulated reduction in dilution refrigerator cooling capacity.",
        "mitigation": "Inspect circulation flow and rebalance the cooling cells.",
    },
    "cable_heat": {
        "title": "RF Cable Heat Leak",
        "parameter": "Cable heat load",
        "baseline": "2.4 µW/line",
        "current": "7.8 µW/line",
        "severity": "MEDIUM",
        "affected_stage": "cold-plate",
        "explanation": "A simulated thermal anchoring issue increased RF line conduction.",
        "mitigation": "Inspect thermal clamps and lower continuous microwave drive.",
    },
    "qubit_noise": {
        "title": "Qubit Noise Surge",
        "parameter": "Qubit dephasing",
        "baseline": "14.2 kHz",
        "current": "48.9 kHz",
        "severity": "HIGH",
        "affected_stage": "mxc",
        "explanation": "A simulated increase in resonator thermal photon noise.",
        "mitigation": "Check infrared filtering and stabilize the MXC base temperature.",
    },
}

active_fault: str | None = None

app = FastAPI(
    title="CRYOSIGHT API",
    description="Simulated cryogenic telemetry and Qiskit QAOA optimization.",
    version="1.0.0",
)
app.add_middleware(
    CORSMiddleware,
    # Hackathon-friendly: accept requests from any origin so the Vercel
    # production URL, Vercel preview deployments, and local development all
    # work without CORS errors. Tighten this list before any real deployment.
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, error: Exception) -> JSONResponse:
    logger.error(
        "Unhandled request error for %s %s",
        request.method,
        request.url.path,
        exc_info=(type(error), error, error.__traceback__),
    )
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal Server Error",
            "details": f"{type(error).__name__}: {error}",
        },
    )


class FaultRequest(BaseModel):
    type: FaultType | Literal["clear"]


class QaoaRequest(BaseModel):
    gamma: float = Field(default=1.25, ge=0.0, le=6.2832)
    beta: float = Field(default=0.85, ge=0.0, le=3.1416)
    shots: int = Field(default=1024, ge=128, le=8192)


class QaoaResponse(BaseModel):
    algorithm: str
    layers: int
    shots: int
    gamma: float
    beta: float
    optimal_state: str
    best_bitstring: str
    best_objective: float
    exact_optimal_bitstring: str
    exact_optimal_objective: float
    ising_offset: float
    probabilities: dict[str, float]
    objectives: dict[str, float]
    circuit: str


def _telemetry(qubits: int, cooling_cells: int) -> dict:
    global active_fault
    heat_load = 8.0 + qubits * 0.0125
    cooling_power = cooling_cells * 22.0
    load = min(99.0, max(12.0, round(heat_load / cooling_power * 100)))
    temperature = 8.2 + max(0, load - 47) * 0.035
    anomaly = min(30, round(load * 0.25))
    health = max(70, round(100 - max(0, load - 80) * 1.5))

    if active_fault:
        fault_deltas = {
            "temp_spike": (5.6, 22, 88, 42),
            "cooling_degradation": (3.4, 28, 82, 38),
            "cable_heat": (2.1, 18, 74, 28),
            "qubit_noise": (1.2, 12, 79, 35),
        }
        temp_delta, load_delta, anomaly, health_delta = fault_deltas[active_fault]
        temperature += temp_delta
        load = min(99, load + load_delta)
        health = max(35, health - health_delta)

    margin = max(1, 100 - load)
    stages = [
        ("50k", "50 K Radiation Shield", 50.0, 50.0 + qubits / 10000 * 1.8),
        ("4k", "4 K Flange", 4.2, 4.2 + qubits / 10000 * 0.45),
        ("still", "700 mK Still", 0.7, 0.7 + qubits / 10000 * 0.08),
        ("cold-plate", "100 mK Cold Plate", 0.1, 0.1 + qubits / 10000 * 0.02),
        ("mxc", "10 mK Mixing Chamber", 0.0082, temperature / 1000),
    ]

    return {
        "vacuum_pressure_mbar": 1.2e-7,
        "qubit_count": qubits,
        "mxc_temp_mk": round(temperature, 2),
        "thermal_load_pct": load,
        "thermal_margin_pct": margin,
        "system_health_pct": health,
        "anomaly_score": anomaly,
        "cooling_cells": cooling_cells,
        "cooling_power_uw": cooling_power,
        "heat_dissipation_uw": round(heat_load, 2),
        "active_fault": active_fault,
        "stages": [
            {
                "id": stage_id,
                "name": name,
                "nominal_temp_k": nominal,
                "current_temp_k": current,
                "status": (
                    "abnormal"
                    if active_fault and stage_id == "mxc"
                    else "warning"
                    if current > nominal * 1.1
                    else "stable"
                ),
            }
            for stage_id, name, nominal, current in stages
        ],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/")
def root() -> dict[str, str]:
    return {"status": "ok", "service": "cryosight-api"}


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "cryosight-api"}


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "cryosight-api"}


@app.get("/api/telemetry")
def telemetry(
    qubits: int = Query(default=1000, ge=100, le=10000),
    cooling_cells: int = Query(default=2, ge=1, le=4),
) -> dict:
    return _telemetry(qubits, cooling_cells)


@app.post("/api/fault-injection")
def inject_fault(request: FaultRequest) -> dict:
    global active_fault
    active_fault = None if request.type == "clear" else request.type
    result = _telemetry(1000, 2)
    result["fault"] = None if active_fault is None else {
        **FAULTS[active_fault],
        "type": active_fault,
    }
    return result


@app.post("/api/qaoa", response_model=QaoaResponse)
async def qaoa(request: QaoaRequest) -> QaoaResponse:
    try:
        await asyncio.wait_for(qaoa_slots.acquire(), timeout=30)
    except TimeoutError as error:
        raise HTTPException(
            status_code=503,
            detail="QAOA simulator is busy; retry shortly.",
            headers={"Retry-After": "5"},
        ) from error

    try:
        result: dict[str, Any] = await run_in_threadpool(
            run_qaoa,
            gamma=request.gamma,
            beta=request.beta,
            shots=request.shots,
        )
    except QaoaSimulationError as error:
        logger.exception("QAOA simulation failed")
        raise HTTPException(
            status_code=503,
            detail=f"QAOA simulation failed: {error}",
        ) from error
    except Exception as error:
        logger.exception("Unexpected QAOA endpoint failure")
        raise HTTPException(
            status_code=500,
            detail="QAOA simulation failed; inspect backend logs.",
        ) from error
    finally:
        qaoa_slots.release()

    return QaoaResponse(
        algorithm=result["algorithm"],
        layers=result["layers"],
        shots=result["shots"],
        gamma=result["gamma"],
        beta=result["beta"],
        optimal_state=result["best_bitstring"],
        best_bitstring=result["best_bitstring"],
        best_objective=result["best_objective"],
        exact_optimal_bitstring=result["exact_optimal_bitstring"],
        exact_optimal_objective=result["exact_optimal_objective"],
        ising_offset=result["ising_offset"],
        probabilities={
            item["bitstring"]: item["probability"]
            for item in result["probabilities"]
        },
        objectives={
            item["bitstring"]: item["objective"]
            for item in result["probabilities"]
        },
        circuit=result["circuit"],
    )
