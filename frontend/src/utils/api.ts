export interface TelemetryStage {
  id: string;
  name: string;
  nominal_temp_k: number;
  current_temp_k: number;
  status: 'stable' | 'warning' | 'abnormal';
}

export interface TelemetryResponse {
  vacuum_pressure_mbar: number;
  qubit_count: number;
  mxc_temp_mk: number;
  thermal_load_pct: number;
  thermal_margin_pct: number;
  system_health_pct: number;
  anomaly_score: number;
  cooling_cells: number;
  cooling_power_uw: number;
  heat_dissipation_uw: number;
  active_fault: string | null;
  stages: TelemetryStage[];
  timestamp: string;
}

export interface QaoaResponse {
  algorithm: string;
  layers: number;
  shots: number;
  gamma: number;
  beta: number;
  optimal_state: string;
  best_bitstring: string;
  best_objective: number;
  exact_optimal_bitstring: string;
  exact_optimal_objective: number;
  ising_offset: number;
  probabilities: Record<string, number>;
  objectives: Record<string, number>;
  circuit: string;
}

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000')
  .replace(/\/+$/, '');

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });
  } catch (error) {
    console.error(`CRYOSIGHT API network error: ${path}`, error);
    throw new Error(
      `Cannot connect to the CRYOSIGHT API at ${API_BASE_URL}. Confirm the FastAPI server is running on port 8000.`
    );
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string } | null;
    const message = body?.detail ?? `API request failed with status ${response.status}`;
    console.error(`CRYOSIGHT API error: ${path}`, message);
    throw new Error(message);
  }

  try {
    return await response.json() as T;
  } catch (error) {
    console.error(`CRYOSIGHT API returned invalid JSON: ${path}`, error);
    throw new Error(`The CRYOSIGHT API returned an invalid response for ${path}.`);
  }
}

export function fetchTelemetry(qubits: number, coolingCells: number): Promise<TelemetryResponse> {
  const query = new URLSearchParams({
    qubits: String(qubits),
    cooling_cells: String(coolingCells),
  });
  return request<TelemetryResponse>(`/api/telemetry?${query.toString()}`);
}

export function injectFault(type: string): Promise<TelemetryResponse> {
  return request<TelemetryResponse>('/api/fault-injection', {
    method: 'POST',
    body: JSON.stringify({ type }),
  });
}

export function runQaoa(gamma: number, beta: number, shots = 1024): Promise<QaoaResponse> {
  return request<QaoaResponse>('/api/qaoa', {
    method: 'POST',
    body: JSON.stringify({ gamma, beta, shots }),
  });
}
