"""Small, reproducible QAOA simulation for cryogenic heat/margin allocation."""

from __future__ import annotations

from itertools import product
from typing import Any

from qiskit import QuantumCircuit
from qiskit_aer import AerSimulator
from qiskit_optimization import QuadraticProgram


class QaoaSimulationError(RuntimeError):
    """Raised when Qiskit cannot complete the bounded QAOA simulation."""


def _build_problem() -> QuadraticProgram:
    problem = QuadraticProgram("cryogenic_heat_vs_margin")
    for index in range(4):
        problem.binary_var(name=f"x{index}")

    # Negative readiness/margin rewards select x1 and x2; positive heat and
    # cross-talk penalties discourage unnecessary or coupled payload elements.
    problem.minimize(
        linear={0: 0.55, 1: -1.35, 2: -1.1, 3: 0.7},
        quadratic={
            (0, 1): 0.42,
            (0, 2): 0.25,
            (1, 2): 0.12,
            (1, 3): 0.38,
            (2, 3): 0.31,
        },
    )
    return problem


def _format_bitstring(value: int, width: int) -> str:
    return format(value, f"0{width}b")


def run_qaoa(gamma: float = 1.25, beta: float = 0.85, shots: int = 1024) -> dict[str, Any]:
    """Run one QAOA layer with Qiskit Optimization's QUBO-to-Ising mapping."""
    try:
        if not 128 <= shots <= 8192:
            raise ValueError("shots must be between 128 and 8192")

        problem = _build_problem()
        cost_operator, offset = problem.to_ising()
        width = problem.get_num_vars()

        circuit = QuantumCircuit(width, width)
        circuit.h(range(width))

        # Qiskit Pauli labels are written from the highest qubit index to q0.
        for pauli, coefficient in cost_operator.to_list():
            z_qubits = [
                width - 1 - label_index
                for label_index, pauli_char in enumerate(pauli)
                if pauli_char == "Z"
            ]
            coefficient_value = float(coefficient.real)
            if len(z_qubits) == 1:
                circuit.rz(2 * gamma * coefficient_value, z_qubits[0])
            elif len(z_qubits) == 2:
                circuit.rzz(2 * gamma * coefficient_value, z_qubits[0], z_qubits[1])

        circuit.rx(2 * beta, range(width))
        circuit.measure(range(width), range(width))

        # The model is fixed at four qubits (16 amplitudes); single-threaded
        # execution prevents Aer from multiplying memory use under load.
        simulator = AerSimulator(
            method="statevector",
            max_parallel_threads=1,
            max_parallel_experiments=1,
            max_parallel_shots=1,
            seed_simulator=42,
        )
        counts = simulator.run(circuit, shots=shots).result().get_counts()
        probabilities = {
            _format_bitstring(value, width): 0.0 for value in range(2**width)
        }
        for measured, count in counts.items():
            bitstring = measured.replace(" ", "").zfill(width)
            probabilities[bitstring] = count / shots

        def objective(bitstring: str) -> float:
            variables = [int(bit) for bit in reversed(bitstring)]
            return float(problem.objective.evaluate(variables))

        measured_bitstrings = {
            measured.replace(" ", "").zfill(width) for measured in counts
        }
        best_bitstring = min(
            measured_bitstrings,
            key=lambda bitstring: (objective(bitstring), -probabilities[bitstring]),
        )
        exact_solution = min(
            (_format_bitstring(value, width) for value in range(2**width)),
            key=objective,
        )

        return {
            "algorithm": "QAOA",
            "layers": 1,
            "shots": shots,
            "gamma": gamma,
            "beta": beta,
            "best_bitstring": best_bitstring,
            "best_objective": objective(best_bitstring),
            "exact_optimal_bitstring": exact_solution,
            "exact_optimal_objective": objective(exact_solution),
            "ising_offset": float(offset),
            "probabilities": [
                {
                    "bitstring": bitstring,
                    "probability": probability,
                    "objective": objective(bitstring),
                }
                for bitstring, probability in sorted(probabilities.items())
            ],
            "circuit": str(circuit.draw(output="text")),
        }
    except Exception as error:
        raise QaoaSimulationError(
            f"Qiskit Aer simulation failed: {type(error).__name__}: {error}"
        ) from error


def enumerate_objectives() -> list[dict[str, Any]]:
    """Return the classical QUBO objective for each four-bit candidate."""
    problem = _build_problem()
    values = []
    for bits in product((0, 1), repeat=4):
        bitstring = "".join(str(bit) for bit in bits)
        values.append(
            {
                "bitstring": bitstring,
                "objective": float(problem.objective.evaluate(list(bits))),
            }
        )
    return values
