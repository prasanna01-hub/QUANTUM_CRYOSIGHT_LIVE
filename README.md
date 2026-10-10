# ❄️ CRYOSIGHT: Quantum Cryogenic Digital Twin & AI Control

## 📌 The Problem: Bridging Cryogenic Stability and Qubit Readiness

Superconducting quantum computers require extremely low temperatures (10–20 mK) for reliable qubit operation. As processors scale, increasing control and readout complexity can affect thermal load and cooling margin, while noise, decoherence, and frequency drift can impact qubit performance.

**The challenge is to connect cryogenic conditions, qubit health, and infrastructure scaling to identify suitable qubits for a given workload.** CryoSight addresses this challenge through a unified software-based digital twin for system monitoring, anomaly analysis, and qubit selection.

## 👥 Who Faces This Problem & Why It Matters?

**Who faces this problem?**
Quantum hardware researchers, cryogenic engineers, quantum computing developers, and research laboratories working with superconducting quantum processors.

**Why is it important?**
As quantum processors scale, maintaining stable operating conditions and assessing qubit performance become increasingly complex. Poor qubit performance and limited cooling margins can affect computational reliability and efficient resource utilization.

**Impact:** Supporting more informed decisions toward reliable and scalable quantum computing.

## 🚀 What Are We Building? (CryoSight)

CryoSight is a **software-based cryogenic digital twin** that simulates a superconducting quantum computing environment and connects cryogenic conditions with qubit health and infrastructure scaling.

The platform integrates:
*   **Cryogenic Digital Twin:** Simulates cooling stages, temperature, thermal load, and cooling margin.
*   **Qubit Health Analytics:** Evaluates simulated T1, T2, readout fidelity, noise, and frequency drift.
*   **AI Anomaly Monitoring:** Identifies unusual patterns in simulated system data.
*   **Infrastructure Scaling:** Explores how increasing qubit counts and representative signal paths affect thermal load.
*   **Quantum Optimization:** Uses a QUBO/QAOA-style simulation to explore suitable qubit selection for a workload.
*   **3D Quantum Lab:** Visualizes the cryogenic system, quantum processor, telemetry, and analysis results.

## ⚛️ Why Quantum Technology?

CryoSight focuses on **superconducting quantum computers**, where qubit performance depends on carefully controlled cryogenic conditions and reliable control infrastructure. Quantum technology is relevant in two ways:

1.  **Quantum Hardware:** The platform simulates the cryogenic environment and qubit-performance parameters of a superconducting quantum processor.
2.  **Quantum Optimization:** QUBO formulation and a QAOA-style simulation explore the selection of suitable qubits while considering readiness, noise, and connectivity constraints.

By connecting cryogenic monitoring with quantum workload optimization, CryoSight explores how intelligent software can support better decisions as quantum systems scale.

## 🔬 Quantum Circuit Implementation (QAOA / QUBO)

Our platform implements a Parameterized Quantum Circuit (P=1 Layer) to solve the QUBO problem of Cryogenic Heat vs. Margin Objective.

**Conceptual Pipeline:**
`Qubit Metrics` → `Readiness Score` → `QUBO Formulation` → `QAOA Simulation` → `Best Qubit Subset` → `Preview Subset: |0110>`

**Circuit Architecture (P=1 Layer):**
*   **Initialization:** Hadamard gates (`H`) on all target qubits (q[0] to q[3]).
*   **Cost Hamiltonian:** `Rz(γ)` gates applied with Cost Angle `γ = 1.25 rad`.
*   **Entanglement:** CNOT gates establishing inter-qubit couplings.
*   **Mixer Hamiltonian:** `Rx(β)` gates applied with Mixer Angle `β = 0.85 rad`.
*   **Measurement:** Qubit state measurement yielding the optimal subset `|0110>`.

![QAOA P=1 circuit for the cryogenic heat-vs-margin QUBO](docs/qaoa_circuit.png)

*(Refer to the UI implementation in the `QuantumLab.tsx` component for the interactive circuit visualization).*

## ⚛️ QISKIT: Quantum Optimization Engine

CryoSight leverages **Qiskit**, IBM's open-source quantum computing SDK, to solve the complex optimization problem of qubit selection and thermal management. Instead of relying solely on classical heuristics, we map our cryogenic thermal objectives into a quantum-ready format.

### 1. QUBO Formulation (Quadratic Unconstrained Binary Optimization)
The core problem is modeled as a QUBO, where the objective is to minimize the heat dissipation (`P_heat`) across the dilution stages while maximizing the thermal margin (`Margin`) and penalizing cross-talk (`J_ij`) between adjacent transmon qubits.

### 2. QAOA (Quantum Approximate Optimization Algorithm)
The QUBO problem is translated into an Ising Hamiltonian and solved using a parameterized quantum circuit (P=1 layer) simulated via **Qiskit Aer**.

**Circuit Architecture & Implementation Details:**
*   **Initialization:** Hadamard gates (`H`) applied to all target qubits to create an equal superposition state.
*   **Cost Hamiltonian (Phase Separator):** `Rz(γ)` gates applied using the cost angle `γ = 1.25 rad` to encode the problem constraints.
*   **Entanglement (Mixing):** CNOT gates establish inter-qubit coupling, followed by `Rx(β)` gates using the mixer angle `β = 0.85 rad`.
*   **Measurement:** The quantum state is measured, yielding a probability distribution.
*   **Optimal Result:** The simulation converges on the optimal bitstring `|0110>`, identifying the best-performing qubit subset (e.g., Q0, Q1, Q5, Q6) that satisfies both thermal and fidelity constraints.

*(Refer to the interactive circuit visualization in the `QuantumLab.tsx` component).*

### Qiskit Implementation: QAOA Circuit & Simulation
The following Python snippet (from `backend/qiskit_simulator.py`) illustrates how CryoSight translates the cryogenic thermal QUBO problem into a quantum circuit and executes it using Qiskit Aer:

```python
from qiskit import QuantumCircuit
from qiskit_aer import AerSimulator
from qiskit_optimization import QuadraticProgram

# 1. Define the QUBO Problem (Cryogenic Heat vs. Margin)
problem = QuadraticProgram("cryogenic_heat_vs_margin")
for index in range(4):
    problem.binary_var(name=f"x{index}")

# Minimize heat and penalize cross-talk while maximizing readiness
problem.minimize(
    linear={0: 0.55, 1: -1.35, 2: -1.1, 3: 0.7},
    quadratic={(0, 1): 0.42, (0, 2): 0.25, (1, 2): 0.12, (1, 3): 0.38, (2, 3): 0.31}
)

# 2. Map QUBO to Ising Hamiltonian (Cost Operator)
cost_operator, offset = problem.to_ising()
width = problem.get_num_vars()

# 3. Build the Parameterized Quantum Circuit (P=1 Layer)
circuit = QuantumCircuit(width, width)
circuit.h(range(width)) # Hadamard initialization

# Apply Rz(γ) for Cost Hamiltonian (γ = 1.25 rad)
for pauli, coefficient in cost_operator.to_list():
    z_qubits = [width - 1 - i for i, char in enumerate(pauli) if char == "Z"]
    if len(z_qubits) == 1:
        circuit.rz(2 * 1.25 * float(coefficient.real), z_qubits[0])
    elif len(z_qubits) == 2:
        circuit.rzz(2 * 1.25 * float(coefficient.real), z_qubits[0], z_qubits[1])

# Apply Rx(β) for Mixer Hamiltonian (β = 0.85 rad)
circuit.rx(2 * 0.85, range(width))
circuit.measure(range(width), range(width))

# 4. Simulate on Qiskit Aer (Statevector Method, 1024 Shots)
simulator = AerSimulator(method="statevector", seed_simulator=42)
counts = simulator.run(circuit, shots=1024).result().get_counts()

# 5. Extract Probabilities and Optimal Bitstring (e.g., |0110>)
# The simulation converges to the best qubit subset satisfying thermal constraints.
```

## ❄️ DILUTION REFRIGERATORS: The Cryogenic Hardware Context

To understand the quantum optimization, one must understand the hardware it serves. Superconducting qubits operate at near-absolute zero temperatures. CryoSight simulates a multi-stage **Dilution Refrigerator** (the "Cryostat"), which is the backbone of this environment.

### The Thermal Gradient Stack (300 K to 10 mK)
Our digital twin models the physical cooling stages, each with distinct thermal loads, attenuation configurations, and wiring:

1.  **Room Temperature Flange (300 K):** The classical control electronics interface. No attenuation.
2.  **50 K Radiation Shield:** Captures initial radiative heat.
3.  **4 K Stage (HEMT Anchor):** Houses the High Electron Mobility Transistor (HEMT) amplifiers. Attenuation: -20 dB.
4.  **700 mK Still Evaporator:** The first sub-kelvin stage using Helium-3/Helium-4 mixture. Attenuation: -10 dB.
5.  **100 mK Cold Plate:** Intermediate heat exchanger. Attenuation: -20 dB.
6.  **10 mK Mixing Chamber (MXC):** The coldest stage where the superconducting QPU (Transmon Lattice) resides. It operates at an equilibrium of **8.2 mK** with a nominal cooling power of 22 µW. Attenuation: -20 dB cold attenuator.

### Why This Matters for Qiskit Optimization
The physical routing of coaxial cables (NbTi superconducting lines) introduces thermal noise and signal attenuation. By modeling the entire dilution refrigerator in our digital twin, CryoSight ensures that the **QAOA qubit selection** considers not just qubit coherence (T1/T2), but also the **thermal footprint** and **cooling margin** required to execute the workload without degrading the system.

## 🛠️ Technical Stack

*   **Frontend:** React 19, TypeScript, Vite, Three.js (3D Digital Twin), Recharts (Telemetry), Tailwind CSS v4, Framer Motion, Lucide React.
*   **Backend:** Python 3.11+, FastAPI, Uvicorn, Pydantic.
*   **Quantum & AI:** Qiskit, Qiskit Aer, Qiskit Optimization (QAOA, QUBO), AI Diagnostics (Anomaly Detection).

## 📂 Project Structure

```text
CRYOSIGHT/
├── frontend/               # React + Vite Application
│   ├── src/
│   │   ├── components/     # UI Components (3D, Telemetry, Diagnostics)
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── .env                # Frontend Environment Variables
│   ├── package.json
│   └── vite.config.ts
├── backend/                # FastAPI + Qiskit Server
│   ├── main.py             # API Endpoints & CORS
│   ├── qiskit_simulator.py # QAOA/QUBO Logic
│   └── requirements.txt
├── docs/                   # Documentation assets
│   └── qaoa_circuit.png
└── README.md
```

> **Simulation notice:** all telemetry, fault scenarios, and quantum measurements are simulated. This project does not control or connect to physical cryogenic or quantum hardware.

## 🧑‍💻 Local Development

**Requirements:** Node.js 20 or newer and npm, Python 3.11 or newer.

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

### 2. Install and run the frontend

```powershell
Set-Location frontend
npm install
npm run dev
```

Open <http://localhost:3000>. Vite listens on port 3000 and the frontend reads `VITE_API_URL` from `frontend/.env` (default: `http://127.0.0.1:8000`).

### API endpoints

`GET /api/health`, `GET /api/telemetry`, `POST /api/fault-injection`, `POST /api/qaoa`.

## ✅ Development checks

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
