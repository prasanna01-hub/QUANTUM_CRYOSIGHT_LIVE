import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  Cpu,
  Layers,
  Radio,
  Server,
  Workflow,
  Zap,
  LucideIcon,
} from 'lucide-react';
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { FaultType } from '../types/cryo';

interface ConnectivitySectionProps {
  qubits: number;
  coolingCells: number;
  mxcTempMilliK: number;
  thermalLoadPct: number;
  thermalMarginPct: number;
  hasFault: boolean;
  activeFaultType: string | null;
  onTriggerFault: (type: FaultType) => void;
  onClearFault: () => void;
}

interface RoutingStage {
  id: string;
  name: string;
  temp: string;
  attenuation: string;
  ports: string;
  cable: string;
  shield: string;
  description: string;
}

interface ScatterPoint {
  i: number;
  q: number;
}

const ROUTING_STAGES: RoutingStage[] = [
  {
    id: 'room-temp',
    name: 'Room Temp Flange',
    temp: '300 K',
    attenuation: '0 dB',
    ports: 'AWG + Local Oscillator feedthrough',
    cable: 'Semi-rigid stainless coaxial lines',
    shield: 'Room-temperature vacuum boundary',
    description: 'Classical drive and readout signals enter the cryostat through the room-temperature vacuum flange.',
  },
  {
    id: '50k',
    name: '50 K Radiation Shield',
    temp: '50.4 K',
    attenuation: '0 dB',
    ports: 'Thermal intercept + RF feedthrough',
    cable: 'Stainless steel coaxial lines',
    shield: 'Copper radiation shield',
    description: 'The first thermal intercept anchors incoming coaxial lines while the radiation shield limits thermal loading.',
  },
  {
    id: '4k',
    name: '4 K Stage (HEMT Anchor)',
    temp: '4.2 K',
    attenuation: '-20 dB attenuators',
    ports: 'HEMT amplifier + input attenuators',
    cable: 'CuNi attenuator lines',
    shield: 'Copper cold plate with magnetic shielding',
    description: 'The 4 K stage anchors the HEMT readout amplifier and attenuates room-temperature noise before it reaches the payload.',
  },
  {
    id: 'still',
    name: '700 mK Still Evaporator',
    temp: '700 mK',
    attenuation: '-10 dB attenuators',
    ports: 'Still intercept + filtered RF ports',
    cable: 'CuNi low-thermal-conductance coax',
    shield: 'Still plate thermal intercept',
    description: 'The still stage provides an intermediate thermal anchor and filters residual noise along the sub-kelvin RF path.',
  },
  {
    id: '100mk',
    name: '100 mK Cold Plate',
    temp: '100 mK',
    attenuation: '-20 dB attenuators',
    ports: 'Cold attenuation + QPU input lines',
    cable: 'Phosphor-bronze low-heat-load lines',
    shield: 'High-purity copper cold plate',
    description: 'The cold plate anchors the final drive lines and minimizes conducted heat immediately above the mixing chamber.',
  },
  {
    id: 'mxc',
    name: '10 mK Mixing Chamber',
    temp: '8.2 mK',
    attenuation: '-20 dB cold attenuator',
    ports: 'TWPA + Cryoperm Cavity',
    cable: 'Nichrome attenuator lines',
    shield: 'Superconducting NbTi + BeCu mix',
    description: 'The mixing chamber hosts the QPU, the TWPA readout path, and final cold attenuation at the system’s lowest-temperature boundary.',
  },
];

const FAULT_SCENARIOS: {
  id: 'cable-heat' | 'attenuator' | 'qubit-noise';
  title: string;
  description: string;
  faultType: FaultType;
}[] = [
  {
    id: 'cable-heat',
    title: 'SIMULATE CABLE HEAT LEAK',
    description: 'Simulates high thermal contact braid impedance between 4 K and 100 mK plates.',
    faultType: 'cable_heat',
  },
  {
    id: 'attenuator',
    title: 'SIMULATE ATTENUATOR FAILURE',
    description: 'Simulates condensing line backing pressure blockages and reduced flow margin.',
    faultType: 'cooling_degradation',
  },
  {
    id: 'qubit-noise',
    title: 'SIMULATE QUBIT NOISE SURGE',
    description: 'Surges excess thermal blackbody microwave photons inside the magnetic shield.',
    faultType: 'qubit_noise',
  },
];

const makeCloud = (seed: number, centerI: number, centerQ: number): ScatterPoint[] =>
  Array.from({ length: 34 }, (_, index) => {
    const angle = index * 2.399963229728653 + seed;
    const radius = 0.08 + ((index * 17) % 19) / 100;
    return {
      i: Number((centerI + Math.cos(angle) * radius).toFixed(3)),
      q: Number((centerQ + Math.sin(angle) * radius * 0.8).toFixed(3)),
    };
  });

const READOUT_ZERO = makeCloud(0.35, -1.2, 0.52);
const READOUT_ONE = makeCloud(1.7, 1.2, -0.48);

const SectionHeading = ({
  icon: Icon,
  title,
  badge,
}: {
  icon: LucideIcon;
  title: string;
  badge: string;
}) => (
  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
    <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 sm:text-lg">
      <Icon className="h-5 w-5 shrink-0 text-sky-600" />
      {title}
    </h2>
    <span className="rounded bg-slate-100 px-2 py-1 font-mono-tech text-[9px] font-bold uppercase tracking-wide text-slate-500">
      {badge}
    </span>
  </div>
);

const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 ${className}`}>
    {children}
  </section>
);

export const ConnectivitySection: React.FC<ConnectivitySectionProps> = ({
  qubits,
  mxcTempMilliK,
  hasFault,
  activeFaultType,
  onTriggerFault,
  onClearFault,
}) => {
  const [selectedStageId, setSelectedStageId] = useState('mxc');
  const [selectedFault, setSelectedFault] = useState<FaultType | null>(
    (activeFaultType as FaultType | null) ?? null,
  );

  useEffect(() => {
    setSelectedFault((activeFaultType as FaultType | null) ?? null);
  }, [activeFaultType]);

  const selectedStage = ROUTING_STAGES.find((stage) => stage.id === selectedStageId) ?? ROUTING_STAGES[5];
  const effectiveFault = selectedFault ?? (activeFaultType as FaultType | null);
  const mxcTemperatureDisplay = `${mxcTempMilliK.toFixed(1)} mK`;
  const selectedStageTemperature = selectedStage.id === 'mxc'
    ? mxcTemperatureDisplay
    : selectedStage.temp;

  const toggleFault = (faultType: FaultType) => {
    if (effectiveFault === faultType) {
      setSelectedFault(null);
      if (hasFault) onClearFault();
      return;
    }

    setSelectedFault(faultType);
    onTriggerFault(faultType);
  };

  const clearFault = () => {
    setSelectedFault(null);
    onClearFault();
  };

  const pipelineMetrics = [
    { label: 'MXC Temperature', value: `${mxcTempMilliK.toFixed(2)} mK` },
    { label: 'Coaxial Intercept Attenuation Flux', value: '2.4 µW/line' },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="mb-1 font-mono-tech text-[10px] font-bold uppercase tracking-[0.18em] text-sky-700">
            Physical Integrity &amp; I/O Mapping
          </p>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
            Hybrid Quantum-Classical Connectivity &amp; Signal Flow
          </h1>
          <p className="mt-2 max-w-4xl text-sm leading-relaxed text-slate-600">
            End-to-end mapping of classical control electronics, cryogenic RF routing, and QPU I/O telemetry within the CryoSight digital twin.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono-tech text-[11px] text-slate-700 shadow-sm">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          Digital Twin Engine: Synced
        </div>
      </header>

      <Card>
        <SectionHeading icon={Zap} title="Section A: Real-Time Closed-Loop Hybrid Signal Flow" badge="Closed-Loop Processing Map" />
        <p className="mt-4 text-sm leading-relaxed text-slate-600">
          The hybrid loop modulates parameter rotation angles (γ, β) from the classical host, translating them into micro-pulse frequencies, pre-cooling them inside the cryostat, firing them onto the transmon junctions, and demodulating I/Q readout profiles back into the classical optimizer.
        </p>
        <div className="mt-4 grid grid-cols-1 items-center gap-5 rounded-2xl border border-slate-100 bg-slate-50 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(190px,1.05fr)_minmax(0,1fr)]">
          <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-4">
            <h3 className="flex items-center gap-2 border-b border-sky-200 pb-2 font-mono-tech text-xs font-extrabold text-sky-900">
              <Server className="h-4 w-4 text-sky-600" />
              CLASSICAL DOMAIN (300 K)
            </h3>
            <ul className="mt-2 space-y-1 font-mono-tech text-[11px] leading-relaxed text-slate-600">
              <li>• Optimization Alg: <strong className="text-slate-900">QAOA / QUBO</strong></li>
              <li>• Control Software: <strong className="text-slate-900">Qiskit Runtime ANSI</strong></li>
              <li>• Electronics: <strong className="text-slate-900">AWG / Local Oscillators</strong></li>
              <li>• Modulation: <strong className="text-sky-700">14-bit DAC / XY pulse</strong></li>
            </ul>
          </div>

          <div className="flex flex-col gap-3 px-1">
            <div className="relative flex h-9 items-center justify-center rounded-full border border-slate-200 bg-slate-200/70 px-3 text-center font-mono-tech text-[10px] text-slate-700">
              <span className="absolute left-0 top-1/2 h-2.5 w-2.5 -translate-y-1/2 animate-pulse rounded-full bg-cyan-500 shadow-[0_0_12px_#06b6d4]" />
              <ArrowDown className="mr-1 h-3.5 w-3.5 rotate-[-90deg] text-cyan-600" />
              <strong className="text-cyan-700">DOWNLINK:</strong>
              <span className="ml-1">XY Drive &amp; DC Flux</span>
              <ArrowDown className="ml-1 h-3.5 w-3.5 rotate-[-90deg] text-cyan-600" />
              <span className="absolute right-0 top-1/2 h-2.5 w-2.5 -translate-y-1/2 animate-pulse rounded-full bg-cyan-500 shadow-[0_0_12px_#06b6d4]" />
            </div>
            <div className="relative flex h-9 items-center justify-center rounded-full border border-slate-200 bg-slate-200/70 px-3 text-center font-mono-tech text-[10px] text-slate-700">
              <span className="absolute left-0 top-1/2 h-2.5 w-2.5 -translate-y-1/2 animate-pulse rounded-full bg-violet-500 shadow-[0_0_12px_#8b5cf6]" />
              <ArrowUp className="mr-1 h-3.5 w-3.5 rotate-[-90deg] text-violet-600" />
              <strong className="text-violet-700">UPLINK:</strong>
              <span className="ml-1">Demodulated Readout</span>
              <ArrowUp className="ml-1 h-3.5 w-3.5 rotate-[-90deg] text-violet-600" />
              <span className="absolute right-0 top-1/2 h-2.5 w-2.5 -translate-y-1/2 animate-pulse rounded-full bg-violet-500 shadow-[0_0_12px_#8b5cf6]" />
            </div>
          </div>

          <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
            <h3 className="flex items-center gap-2 border-b border-indigo-200 pb-2 font-mono-tech text-xs font-extrabold text-indigo-900">
              <Cpu className="h-4 w-4 text-indigo-600" />
              CRYOGENIC DOMAIN (10 mK)
            </h3>
            <ul className="mt-2 space-y-1 font-mono-tech text-[11px] leading-relaxed text-slate-600">
              <li>• Coaxial Cabling: <strong className="text-slate-900">NbTi Superconducting</strong></li>
              <li>• Intercept Filters: <strong className="text-slate-900">Powder / cold attenuators</strong></li>
              <li>• Amplification: <strong className="text-slate-900">TWPA + HEMT chain</strong></li>
              <li>• QPU Junctions: <strong className="text-indigo-700">12-Qubit Transmon Lattice</strong></li>
            </ul>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 items-stretch gap-6 xl:grid-cols-12">
        <Card className="xl:col-span-7">
          <SectionHeading icon={Layers} title="Section B: Cryogenic RF Cabling & Stage Attenuation Map" badge="Sub-Kelvin Path" />
          <p className="mt-4 text-sm leading-relaxed text-slate-600">
            Click any stage in the thermal gradient to inspect RF cabling, cold attenuators, and thermal intercept boundaries.
          </p>
          <div className="mt-4 space-y-2">
            {ROUTING_STAGES.map((stage) => {
              const selected = selectedStageId === stage.id;
              return (
                <button
                  key={stage.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setSelectedStageId(stage.id)}
                  className={`flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-left transition-colors ${
                    selected
                      ? 'border-sky-300 bg-sky-50 ring-1 ring-sky-100'
                      : 'border-slate-200 bg-white hover:border-sky-200 hover:bg-slate-50'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${selected ? 'bg-sky-600' : 'bg-slate-300'}`} />
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-slate-800">{stage.name}</span>
                      <span className="mt-0.5 block font-mono-tech text-[10px] text-slate-500">
                        {stage.id === 'mxc' ? mxcTemperatureDisplay : stage.temp}
                      </span>
                    </span>
                  </span>
                  <span className={`rounded-md px-2 py-1 font-mono-tech text-[10px] font-semibold ${
                    selected ? 'bg-white text-sky-800' : 'bg-slate-100 text-slate-600'
                  }`}>
                    Att: {stage.attenuation}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="xl:col-span-5">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <h2 className="font-mono-tech text-sm font-bold tracking-wide text-slate-600">CABLING DETAILS</h2>
            <span className="font-mono-tech text-xs font-bold text-sky-800">{selectedStageTemperature} Stage</span>
          </div>
          <div className="mt-4 rounded-xl border border-sky-100 bg-sky-50/60 p-3">
            <p className="font-mono-tech text-[9px] font-bold uppercase tracking-wide text-sky-700">Selected Routing Plate</p>
            <h3 className="mt-1 text-base font-bold text-slate-900">{selectedStage.name}</h3>
          </div>
          <dl className="mt-4 divide-y divide-slate-100">
            {[
              ['RF Coaxial Ports', selectedStage.ports],
              ['Cold Attenuation', selectedStage.attenuation],
              ['RF Cable Type', selectedStage.cable],
              ['Shield Material', selectedStage.shield],
            ].map(([label, value]) => (
              <div key={label} className="grid grid-cols-[minmax(105px,0.85fr)_minmax(0,1.15fr)] gap-3 py-3 text-xs">
                <dt className="text-slate-500">{label}</dt>
                <dd className="text-right font-semibold leading-relaxed text-slate-800">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
            {selectedStage.description}
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <SectionHeading icon={Cpu} title="Section C: QPU Coaxial Mapping & Lattice Ports" badge="Lattice Map" />
          <p className="mt-4 text-sm leading-relaxed text-slate-600">
            Planar Josephson junction layout displaying active feedback, readout coaxial lines, and capacitive coupler ties mapped to active readout channels.
          </p>
          <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950 p-4 text-cyan-100 sm:p-5">
            <div className="mx-auto grid max-w-[460px] grid-cols-4 gap-2.5 sm:gap-3">
              {Array.from({ length: 12 }, (_, index) => {
                const active = [0, 1, 5, 6].includes(index);
                return (
                  <div
                    key={index}
                    className={`flex aspect-[1.18] flex-col items-center justify-center rounded-xl border font-mono-tech transition-colors ${
                      active
                        ? 'border-cyan-400 bg-sky-950 text-cyan-300 shadow-[0_0_14px_rgba(6,182,212,0.18)]'
                        : 'border-slate-800 bg-slate-900/70 text-slate-500'
                    }`}
                  >
                    <span className="text-[9px] text-slate-500">JJ_X</span>
                    <span className={`mt-1 text-sm font-bold ${active ? 'text-cyan-300' : 'text-slate-500'}`}>Q{index}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-3 font-mono-tech text-[10px]">
              <span className="font-bold text-cyan-300">• READOUT INTERCEPT ON Q0, Q1, Q5, Q6</span>
              <span className="text-slate-400">Inter-Qubit Capacitive Couplers active</span>
            </div>
          </div>
        </Card>

        <Card>
          <SectionHeading icon={Activity} title="Demodulated Readout State Space (I/Q Clouds)" badge="DSP Resonator" />
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[
              ['CAPACITY', `${qubits.toLocaleString()} Qubits`],
              ['QUBIT NOISE', hasFault && activeFaultType === 'qubit_noise' ? 'Elevated' : '1.2%'],
              ['RESONATOR DEPHASING', '14.2 kHz'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-3 text-center">
                <p className="font-mono-tech text-[8px] font-bold tracking-wide text-slate-400 sm:text-[9px]">{label}</p>
                <p className="mt-1 text-[11px] font-bold text-slate-900 sm:text-xs">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 h-[245px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 18, bottom: 6, left: 0 }}>
                <CartesianGrid stroke="#dbe5f0" strokeDasharray="3 4" />
                <XAxis
                  type="number"
                  dataKey="i"
                  name="In-phase"
                  domain={[-2, 2]}
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  axisLine={{ stroke: '#94a3b8' }}
                  tickLine={{ stroke: '#94a3b8' }}
                />
                <YAxis
                  type="number"
                  dataKey="q"
                  name="Quadrature"
                  domain={[-2, 2]}
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  axisLine={{ stroke: '#94a3b8' }}
                  tickLine={{ stroke: '#94a3b8' }}
                />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  formatter={(value: number, name: string) => [value.toFixed(3), name]}
                  contentStyle={{ borderRadius: 10, borderColor: '#cbd5e1', fontSize: 11 }}
                />
                <Scatter name="Readout |0⟩" data={READOUT_ZERO} fill="#0284c7" />
                <Scatter name="Readout |1⟩" data={READOUT_ONE} fill="#818cf8" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 flex items-center gap-2 text-xs italic text-slate-500">
            <Check className="h-4 w-4 shrink-0 text-emerald-600" />
            High state discrimination margin established. State clouds cleanly separated.
          </p>
        </Card>
      </div>

      <Card>
        <SectionHeading icon={Workflow} title="Section D: Digital Twin Metadata & Telemetry Pipeline" badge="Metadata Pipeline" />
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              step: '1. PHYSICAL SENSORS',
              title: 'RuO₂ Thermometers',
              description: 'Monitors actual base temperature fluctuations inside the cryostat canister.',
            },
            {
              step: '2. TELEMETRY CHANNEL',
              title: 'Attenuator Heat Flux',
              description: 'Cabling intercept attenuation registers passive heat leaks at 2.4 µW/line.',
            },
            {
              step: '3. DIGITAL TWIN SYNC',
              title: 'Metadata Synced',
              description: 'Telemetry registers are processed inside the dynamic system solver.',
            },
            {
              step: '4. USER ACTION CONSOLE',
              title: 'Fault Control',
              description: 'Real-time parameters are pushed back to the client UI canvas layers.',
            },
          ].map((item) => (
            <div key={item.step} className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <p className="font-mono-tech text-[9px] font-bold text-slate-400">{item.step}</p>
              <h3 className="mt-1 font-mono-tech text-xs font-bold text-slate-900">{item.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{item.description}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-2 rounded-xl border border-sky-200 bg-sky-50/70 px-4 py-3 font-mono-tech text-xs text-slate-700 sm:grid-cols-3">
          <span className="font-semibold text-sky-900">Active Pipeline Synchronized Metrics:</span>
          {pipelineMetrics.map((metric) => (
            <span key={metric.label} className="flex flex-wrap items-baseline gap-1">
              {metric.label}: <strong className="text-slate-900">{metric.value}</strong>
            </span>
          ))}
        </div>
      </Card>

      <Card>
        <SectionHeading icon={AlertTriangle} title="Section E: Connectivity Fault Injection Simulator" badge="RF Loop Injector" />
        <p className="mt-4 text-sm leading-relaxed text-slate-600">
          Select an RF or thermal anomaly below to inject it into the closed-loop digital twin telemetry pipeline in real time.
        </p>
        {hasFault && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
            <span className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4" />
              A fault is active in the digital twin.
            </span>
            <button
              type="button"
              onClick={clearFault}
              className="rounded-md border border-rose-200 bg-white px-3 py-1.5 font-semibold text-rose-700 transition-colors hover:bg-rose-100"
            >
              Clear active fault
            </button>
          </div>
        )}
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
          {FAULT_SCENARIOS.map((scenario) => {
            const active = hasFault && effectiveFault === scenario.faultType;
            return (
              <button
                key={scenario.id}
                type="button"
                aria-pressed={active}
                onClick={() => toggleFault(scenario.faultType)}
                className={`rounded-xl border p-4 text-left transition-all ${
                  active
                    ? 'border-rose-300 bg-rose-50 ring-1 ring-rose-100'
                    : 'border-slate-200 bg-white hover:border-amber-300 hover:bg-amber-50/40'
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-mono-tech text-xs font-extrabold tracking-wide text-slate-800">{scenario.title}</span>
                  {active && <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500" />}
                </span>
                <span className="mt-1.5 block text-xs leading-relaxed text-slate-500">{scenario.description}</span>
              </button>
            );
          })}
        </div>
        {effectiveFault && !hasFault && (
          <p className="mt-3 flex items-center gap-2 text-xs text-amber-700">
            <Radio className="h-3.5 w-3.5" />
            Fault request submitted to the digital twin.
          </p>
        )}
        <div className="sr-only" aria-live="polite">
          {hasFault ? `Active fault: ${effectiveFault ?? 'unknown'}` : 'No active connectivity fault'}
        </div>
      </Card>
    </div>
  );
};
