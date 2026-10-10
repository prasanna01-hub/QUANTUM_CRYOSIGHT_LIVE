import React, { useMemo, useState } from 'react';
import { Html, OrbitControls } from '@react-three/drei';
import { Canvas, ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

export type WireStatus = 'safe' | 'monitor' | 'danger';
export type CryostatStageId = '50k' | '4k' | 'still' | 'cold-plate' | 'mxc';

export interface QubitNode3D {
  id: number;
  label: string;
  row: number;
  col: number;
  status: WireStatus;
  readiness: number;
  t1: number;
  t2: number;
  isSelectedByQaoa: boolean;
}

interface QuantumSystem3DProps {
  temperatureMilliK: number;
  anomalyScore: number;
  hasFault: boolean;
  selectedQubitIds?: number[];
  onSelectQubit?: (qubit: QubitNode3D) => void;
  onSelectStage?: (stage: CryostatStageId) => void;
  heightClassName?: string;
}

interface StageDefinition {
  id: CryostatStageId;
  name: string;
  description: string;
  temperature: string;
  y: number;
  radius: number;
}

const STAGES: StageDefinition[] = [
  { id: '50k', name: '50 K Flange', description: 'Radiation Shield', temperature: '50 K', y: 3.55, radius: 2.38 },
  { id: '4k', name: '4 K Flange & Magnet Stage', description: 'Magnet / 4 Kelvin', temperature: '4 K', y: 2.18, radius: 2.03 },
  { id: 'still', name: '700 mK Still Stage', description: 'Still / Evaporator', temperature: '700 mK', y: 0.81, radius: 1.68 },
  { id: 'cold-plate', name: '100 mK Cold Plate', description: 'Intermediate Plate', temperature: '100 mK', y: -0.56, radius: 1.34 },
  { id: 'mxc', name: '10 mK Mixing Chamber', description: 'Quantum Payload', temperature: '10 mK', y: -1.93, radius: 1.05 },
];

const OVERVIEW_POSITION = new THREE.Vector3(7.9, 3.9, 11.5);
const OVERVIEW_TARGET = new THREE.Vector3(0, 0.4, 0);
const CHIP_POSITION = new THREE.Vector3(3.25, -0.72, 5.35);
const CHIP_TARGET = new THREE.Vector3(0, -2.75, 0);

function CameraRig({ focusChip }: { focusChip: boolean }) {
  const { camera } = useThree();
  const controls = React.useRef<OrbitControlsImpl>(null);

  useFrame((_, delta) => {
    const blend = 1 - Math.exp(-3 * delta);
    camera.position.lerp(focusChip ? CHIP_POSITION : OVERVIEW_POSITION, blend);
    if (controls.current) {
      controls.current.target.lerp(focusChip ? CHIP_TARGET : OVERVIEW_TARGET, blend);
      controls.current.update();
    }
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.075}
      enablePan={false}
      minDistance={4.5}
      maxDistance={19}
      minPolarAngle={0.12}
      maxPolarAngle={Math.PI / 1.68}
    />
  );
}

function CryostatScene({
  temperatureMilliK,
  anomalyScore,
  hasFault,
  selectedQubitIds,
  onSelectQubit,
  onSelectStage,
  shieldOpacity,
  focusChip,
}: QuantumSystem3DProps & { shieldOpacity: number; focusChip: boolean }) {
  const [hoveredQubit, setHoveredQubit] = useState<QubitNode3D | null>(null);
  const [hoveredStage, setHoveredStage] = useState<CryostatStageId | null>(null);
  const chipQubits = useMemo(() => {
    const ids = selectedQubitIds ?? [0, 1, 5, 6];
    return Array.from({ length: 12 }, (_, id): QubitNode3D => {
      const row = Math.floor(id / 4);
      const col = id % 4;
      let readiness = 94 - (temperatureMilliK - 10.2) * 2.2 - (hasFault ? 32 : 0);
      readiness = Math.max(15, Math.min(99, Math.round(readiness - ((id * 7) % 11))));
      const status: WireStatus = readiness < 65 ? 'danger' : readiness < 85 ? 'monitor' : 'safe';
      return {
        id,
        label: `Q${id}`,
        row,
        col,
        status,
        readiness,
        t1: Math.round(readiness * 1.45),
        t2: Math.round(readiness * 0.95),
        isSelectedByQaoa: ids.includes(id),
      };
    });
  }, [hasFault, selectedQubitIds, temperatureMilliK]);

  const wireColor = hasFault || temperatureMilliK >= 28 || anomalyScore > 65
    ? '#ef4444'
    : temperatureMilliK >= 16 || anomalyScore > 35
      ? '#f59e0b'
      : '#00d7ad';

  const wireGeometries = useMemo(() => {
    return Array.from({ length: 12 }, (_, index) => {
      const side = index < 6 ? -1 : 1;
      const offset = (index % 6 - 2.5) * 0.17;
      const startX = side * (1.47 + Math.abs(offset) * 0.3);
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(startX, 4.15, offset),
        new THREE.Vector3(startX * 0.93, 3.03, offset * 1.08),
        new THREE.Vector3(startX * 0.8, 1.62, offset * 0.94),
        new THREE.Vector3(startX * 0.68, 0.26, offset * 0.79),
        new THREE.Vector3(startX * 0.57, -1.11, offset * 0.65),
        new THREE.Vector3(side * 0.48, -2.75, offset * 0.55),
      ]);
      return new THREE.TubeGeometry(curve, 64, 0.015, 7, false);
    });
  }, []);

  return (
    <>
      <color attach="background" args={['#f8fbff']} />
      <fog attach="fog" args={['#f8fbff', 16, 30]} />
      <ambientLight intensity={1.8} />
      <hemisphereLight args={['#ffffff', '#d8e8f3', 1.1]} />
      <directionalLight position={[7, 10, 8]} intensity={2.25} color="#fff8ed" />
      <directionalLight position={[-7, 2, -6]} intensity={1.5} color="#c8efff" />
      <pointLight position={[0, 2.5, 4]} intensity={18} distance={14} color="#a9ffed" />

      <mesh position={[0, 0.82, 0]}>
        <cylinderGeometry args={[2.75, 1.45, 6.65, 72, 1, true]} />
        <meshPhysicalMaterial
          color="#a9cddd"
          metalness={0.25}
          roughness={0.18}
          transmission={0.22}
          transparent
          opacity={shieldOpacity}
          side={THREE.DoubleSide}
          depthWrite={false}
          clearcoat={0.9}
          clearcoatRoughness={0.12}
        />
      </mesh>
      <mesh position={[0, 0.82, 0]}>
        <cylinderGeometry args={[2.34, 1.16, 6.2, 64, 1, true]} />
        <meshPhysicalMaterial
          color="#dcecf4"
          metalness={0.16}
          roughness={0.23}
          transparent
          opacity={shieldOpacity * 0.32}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {STAGES.map((stage) => {
        const active = hoveredStage === stage.id;
        return (
          <group
            key={stage.id}
            position={[0, stage.y, 0]}
            onPointerOver={(event) => {
              event.stopPropagation();
              setHoveredStage(stage.id);
            }}
            onPointerOut={() => setHoveredStage(null)}
            onClick={(event: ThreeEvent<MouseEvent>) => {
              event.stopPropagation();
              onSelectStage?.(stage.id);
            }}
          >
            <mesh>
              <cylinderGeometry args={[stage.radius, stage.radius * 0.985, 0.16, 64]} />
              <meshStandardMaterial
                color="#8b5a2b"
                metalness={0.74}
                roughness={0.29}
                emissive={active ? '#4a2b10' : '#000000'}
                emissiveIntensity={active ? 0.3 : 0}
              />
            </mesh>
            <mesh position={[0, 0.09, 0]}>
              <torusGeometry args={[stage.radius * 0.99, active ? 0.055 : 0.032, 10, 72]} />
              <meshStandardMaterial
                color={active ? '#06b6d4' : '#a87536'}
                emissive={active ? '#06b6d4' : '#57340f'}
                emissiveIntensity={active ? 1 : 0.2}
                metalness={0.4}
                roughness={0.25}
              />
            </mesh>
            <mesh position={[0, -0.095, 0]}>
              <cylinderGeometry args={[stage.radius * 0.94, stage.radius * 0.97, 0.045, 64]} />
              <meshStandardMaterial color="#68431f" metalness={0.7} roughness={0.38} />
            </mesh>
            <mesh position={[stage.radius * 0.68, 0.095, stage.radius * 0.42]}>
              <cylinderGeometry args={[0.065, 0.065, 0.025, 20]} />
              <meshBasicMaterial color={wireColor} />
            </mesh>
            <Html
              position={[stage.radius + 0.2, 0, 0]}
              distanceFactor={9}
              style={{ pointerEvents: 'none' }}
            >
              <div className={`min-w-max rounded-md border px-2.5 py-1.5 font-mono-tech text-[10px] shadow-sm ${
                active ? 'border-cyan-300 bg-white text-slate-900' : 'border-slate-200 bg-white/95 text-slate-700'
              }`}>
                <div className="font-bold">{stage.name}</div>
                <div className="text-[9px] text-slate-500">{stage.temperature} · {stage.description}</div>
              </div>
            </Html>
          </group>
        );
      })}

      {[0, 1, 2, 3].map((index) => {
        const angle = (index * Math.PI) / 2 + Math.PI / 4;
        const x = Math.cos(angle) * 1.93;
        const z = Math.sin(angle) * 1.93;
        return (
          <group key={`support-${index}`} position={[x, 0.8, z]}>
            <mesh>
              <cylinderGeometry args={[0.052, 0.052, 5.75, 16]} />
              <meshStandardMaterial color="#9ba9b3" metalness={0.9} roughness={0.22} />
            </mesh>
            {STAGES.map((stage) => (
              <mesh key={stage.id} position={[0, stage.y - 0.8, 0]}>
                <cylinderGeometry args={[0.085, 0.085, 0.1, 16]} />
                <meshStandardMaterial color="#bd9561" metalness={0.82} roughness={0.25} />
              </mesh>
            ))}
          </group>
        );
      })}

      {wireGeometries.map((geometry, index) => (
        <mesh key={`rf-wire-${index}`} geometry={geometry}>
          <meshStandardMaterial
            color={index % 3 === 0 ? wireColor : '#15bdc9'}
            emissive={index % 3 === 0 ? wireColor : '#0aa3ba'}
            emissiveIntensity={0.55}
            metalness={0.2}
            roughness={0.22}
          />
        </mesh>
      ))}

      <group position={[0, -2.82, 0]}>
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[1.8, 0.17, 1.34]} />
          <meshStandardMaterial color="#172b3b" metalness={0.72} roughness={0.26} />
        </mesh>
        <mesh position={[0, 0.095, 0]}>
          <boxGeometry args={[1.58, 0.035, 1.12]} />
          <meshStandardMaterial color="#071b2b" metalness={0.64} roughness={0.24} />
        </mesh>
        {chipQubits.map((qubit) => {
          const x = (qubit.col - 1.5) * 0.31;
          const z = (qubit.row - 1) * 0.31;
          const color = qubit.status === 'danger' ? '#ef4444' : qubit.status === 'monitor' ? '#f59e0b' : '#14b8a6';
          return (
            <group
              key={qubit.id}
              position={[x, 0.13, z]}
              onPointerOver={(event) => {
                event.stopPropagation();
                setHoveredQubit(qubit);
              }}
              onPointerOut={() => setHoveredQubit(null)}
              onClick={(event: ThreeEvent<MouseEvent>) => {
                event.stopPropagation();
                onSelectQubit?.(qubit);
              }}
            >
              <mesh>
                <boxGeometry args={[0.12, 0.055, 0.12]} />
                <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.48} metalness={0.35} roughness={0.25} />
              </mesh>
              {qubit.isSelectedByQaoa && (
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
                  <torusGeometry args={[0.091, 0.012, 6, 24]} />
                  <meshBasicMaterial color="#00c8ff" />
                </mesh>
              )}
            </group>
          );
        })}
        <Html position={[1.08, 0.16, 0]} distanceFactor={8} style={{ pointerEvents: 'none' }}>
          <div className="whitespace-nowrap rounded-md border border-cyan-200 bg-white/95 px-2 py-1 font-mono-tech text-[10px] font-bold text-cyan-800 shadow-sm">
            SUPERCONDUCTING QPU · 12-QUBIT LATTICE
          </div>
        </Html>
      </group>

      <gridHelper args={[16, 32, '#9cc9e6', '#dbeaf5']} position={[0, -3.98, 0]} />
      <CameraRig focusChip={focusChip} />

      {hoveredQubit && (
        <Html position={[0, 0.4, 0]} style={{ pointerEvents: 'none' }}>
          <div className="rounded-lg border border-sky-200 bg-white/95 px-2 py-1 font-mono-tech text-[10px] text-slate-700 shadow">
            {hoveredQubit.label} · readiness {hoveredQubit.readiness}% · T₁ {hoveredQubit.t1} μs
          </div>
        </Html>
      )}
    </>
  );
}

export const QuantumSystem3D: React.FC<QuantumSystem3DProps> = ({
  temperatureMilliK,
  anomalyScore,
  hasFault,
  selectedQubitIds = [0, 1, 5, 6],
  onSelectQubit,
  onSelectStage,
  heightClassName = 'h-[620px] lg:h-[700px]',
}) => {
  const [shieldOpacity, setShieldOpacity] = useState(0.5);
  const [focusChip, setFocusChip] = useState(false);
  const overallWireStatus: WireStatus = hasFault || temperatureMilliK >= 28 || anomalyScore > 65
    ? 'danger'
    : temperatureMilliK >= 16 || anomalyScore > 35
      ? 'monitor'
      : 'safe';

  return (
    <div className={`relative flex w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm ${heightClassName}`}>
      <div className="pointer-events-none absolute inset-x-4 top-4 z-10 flex flex-wrap items-start justify-between gap-3">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur">
          <span className={`flex items-center gap-1.5 rounded-md px-2 py-1 font-mono-tech text-[10px] font-bold ${
            overallWireStatus === 'safe'
              ? 'bg-emerald-50 text-emerald-800'
              : overallWireStatus === 'monitor'
                ? 'bg-amber-50 text-amber-800'
                : 'bg-rose-50 text-rose-800'
          }`}>
            <span className={`h-2 w-2 rounded-full ${
              overallWireStatus === 'safe' ? 'bg-emerald-500' : overallWireStatus === 'monitor' ? 'bg-amber-400' : 'bg-rose-500'
            }`} />
            WIRE STATUS: {overallWireStatus === 'safe' ? 'SAFE / READY' : overallWireStatus.toUpperCase()}
          </span>
          <button
            type="button"
            onClick={() => setShieldOpacity((opacity) => (opacity === 0.5 ? 0.12 : 0.5))}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono-tech text-[10px] font-semibold text-slate-700 transition-colors hover:border-sky-300 hover:bg-sky-50"
          >
            Translucent {Math.round(shieldOpacity * 100)}%
          </button>
          <button
            type="button"
            onClick={() => setFocusChip(true)}
            className="rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1.5 font-mono-tech text-[10px] font-semibold text-sky-800 transition-colors hover:bg-sky-100"
          >
            Focus Chip
          </button>
          <button
            type="button"
            onClick={() => setFocusChip(false)}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono-tech text-[10px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            Reset
          </button>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white/90 px-3 py-2 font-mono-tech text-[9px] font-bold uppercase tracking-wider text-slate-600 shadow-sm">
          Drag to orbit · Scroll to zoom · Click a stage to inspect
        </div>
      </div>

      <Canvas
        camera={{ position: [7.9, 3.9, 11.5], fov: 39, near: 0.1, far: 100 }}
        dpr={[1, 1.75]}
        aria-label="Interactive 3D dilution refrigerator digital twin"
      >
        <CryostatScene
          temperatureMilliK={temperatureMilliK}
          anomalyScore={anomalyScore}
          hasFault={hasFault}
          selectedQubitIds={selectedQubitIds}
          onSelectQubit={onSelectQubit}
          onSelectStage={onSelectStage}
          shieldOpacity={shieldOpacity}
          focusChip={focusChip}
        />
      </Canvas>

      <div className="pointer-events-none absolute bottom-4 left-4 z-10 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-white/95 p-2.5 font-mono-tech text-[10px] shadow-sm backdrop-blur">
        <span className="font-bold uppercase tracking-wider text-slate-700">Signal Legend:</span>
        <span className="flex items-center gap-1.5 text-emerald-800"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Ready (≥85)</span>
        <span className="flex items-center gap-1.5 text-amber-800"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" />Monitor (65–84)</span>
        <span className="flex items-center gap-1.5 text-rose-800"><span className="h-2.5 w-2.5 rounded-full bg-rose-500" />Danger (&lt;65)</span>
        <span className="hidden text-slate-300 sm:inline">|</span>
        <span className="font-bold text-cyan-800">Cyan Rings: QAOA Selected</span>
      </div>
      <div className="pointer-events-none absolute bottom-4 right-4 z-10 hidden rounded-lg border border-slate-200 bg-white/90 px-3 py-2 font-mono-tech text-[9px] font-bold tracking-wider text-slate-500 shadow-sm md:block">
        SIMULATED CRYOGENIC ENVIRONMENT
      </div>
    </div>
  );
};
