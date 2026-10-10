import { OrbitControls } from '@react-three/drei';
import { Canvas, ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { CryoStage, StageId } from '../types/cryo';

interface CryostatStack3DProps {
  stages: CryoStage[];
  selectedStageId: StageId;
  onStageSelect: (stageId: StageId) => void;
  hasFault: boolean;
}

type CryostatSceneProps = CryostatStack3DProps & {
  autoRotate: boolean;
  wireStatus: 'safe' | 'monitor' | 'danger';
  shieldOpacity: number;
  view: CameraView;
};

interface StageLayout {
  id: StageId;
  label: string;
  temperature: string;
  y: number;
  radius: number;
}

type CameraView = 'overview' | 'chip';

const STAGES: StageLayout[] = [
  { id: '50k', label: '50 K Flange', temperature: 'Radiation Shield', y: 2.8, radius: 2.45 },
  { id: '4k', label: '4 K Flange & Magnet Stage', temperature: '4 Kelvin', y: 1.45, radius: 2.05 },
  { id: 'still', label: '700 mK Still Stage', temperature: 'Still / Evaporator', y: 0.1, radius: 1.68 },
  { id: 'cold-plate', label: '100 mK Cold Plate', temperature: 'Intermediate Plate', y: -1.25, radius: 1.32 },
  { id: 'mxc', label: '10 mK Mixing Chamber', temperature: 'Quantum Payload', y: -2.6, radius: 1.02 },
];

const INITIAL_CAMERA = new THREE.Vector3(7.9, 4.2, 11.4);
const INITIAL_TARGET = new THREE.Vector3(0, 0.1, 0);
const CHIP_CAMERA = new THREE.Vector3(3.4, -1.55, 5.6);
const CHIP_TARGET = new THREE.Vector3(0, -3.2, 0);

function createLabelTexture(title: string, subtitle: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 120;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not create a canvas context for the cryostat stage labels.');
  }

  context.fillStyle = 'rgba(255, 255, 255, 0.96)';
  context.strokeStyle = '#cbd5e1';
  context.lineWidth = 4;
  context.beginPath();
  context.roundRect(4, 4, 632, 112, 18);
  context.fill();
  context.stroke();
  context.fillStyle = '#0f172a';
  context.font = 'bold 31px ui-monospace, monospace';
  context.textBaseline = 'middle';
  context.fillText(title, 24, 43, 590);
  context.fillStyle = '#64748b';
  context.font = '24px ui-monospace, monospace';
  context.fillText(subtitle, 24, 84, 590);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function CameraMotion({ view }: { view: CameraView }) {
  const { camera } = useThree();
  const controls = useRef<OrbitControlsImpl>(null);

  useFrame((_, delta) => {
    const blend = 1 - Math.exp(-3.2 * delta);
    const nextPosition = view === 'chip' ? CHIP_CAMERA : INITIAL_CAMERA;
    const nextTarget = view === 'chip' ? CHIP_TARGET : INITIAL_TARGET;

    camera.position.lerp(nextPosition, blend);
    if (controls.current) {
      controls.current.target.lerp(nextTarget, blend);
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
      minDistance={5.4}
      maxDistance={17}
      minPolarAngle={0.16}
      maxPolarAngle={Math.PI / 1.72}
    />
  );
}

function CryostatScene({
  stages,
  selectedStageId,
  onStageSelect,
  hasFault,
  autoRotate,
  wireStatus,
  shieldOpacity,
  view,
}: CryostatSceneProps) {
  const modelGroup = useRef<THREE.Group>(null);
  const plateGroups = useRef<Array<THREE.Group | null>>([]);
  const signalPulses = useRef<Array<THREE.Mesh | null>>([]);
  const [hoveredStage, setHoveredStage] = useState<StageId | null>(null);
  const statusColor = wireStatus === 'danger' ? '#ef4444' : wireStatus === 'monitor' ? '#f59e0b' : '#10b981';
  const stageLabelTextures = useMemo(
    () => STAGES.map((stage) => {
      const telemetry = stages.find((currentStage) => currentStage.id === stage.id);
      return createLabelTexture(stage.label, telemetry?.currentTempDisplay ?? stage.temperature);
    }),
    [stages],
  );
  const qpuLabelTexture = useMemo(() => createLabelTexture('SUPERCONDUCTING QPU', '16-Qubit Transmon Lattice'), []);

  const wires = useMemo(() => {
    const lines: THREE.CatmullRomCurve3[] = [];
    const count = 12;

    for (let index = 0; index < count; index += 1) {
      const side = index < count / 2 ? -1 : 1;
      const offset = (index % (count / 2) - 2.5) * 0.18;
      const startX = side * (1.3 + Math.abs(offset) * 0.4);
      lines.push(
        new THREE.CatmullRomCurve3([
          new THREE.Vector3(startX, 3.25, offset),
          new THREE.Vector3(startX * 0.96, 2.05, offset * 1.08),
          new THREE.Vector3(startX * 0.84, 0.72, offset * 0.92),
          new THREE.Vector3(startX * 0.7, -0.63, offset * 0.78),
          new THREE.Vector3(startX * 0.57, -1.98, offset * 0.62),
          new THREE.Vector3(side * 0.56, -3.34, offset * 0.55),
        ]),
      );
    }

    return lines;
  }, []);

  useEffect(() => {
    return () => {
      stageLabelTextures.forEach((texture) => texture.dispose());
      qpuLabelTexture.dispose();
    };
  }, [qpuLabelTexture, stageLabelTextures]);

  useFrame((_, delta) => {
    if (modelGroup.current && autoRotate) {
      modelGroup.current.rotation.y = (modelGroup.current.rotation.y + delta * (Math.PI * 2 / 30)) % (Math.PI * 2);
    }

    for (const [index, group] of plateGroups.current.entries()) {
      if (!group) continue;
      const active = STAGES[index].id === selectedStageId;
      const hover = STAGES[index].id === hoveredStage;
      const targetScale = active || hover ? 1.035 : 1;
      group.scale.x = THREE.MathUtils.damp(group.scale.x, targetScale, 9, delta);
      group.scale.z = THREE.MathUtils.damp(group.scale.z, targetScale, 9, delta);
    }

    const elapsed = performance.now() / 1000;
    wires.forEach((curve, wireIndex) => {
      for (let pulseIndex = 0; pulseIndex < 3; pulseIndex += 1) {
        const pulseIndexInArray = wireIndex * 3 + pulseIndex;
        const pulse = signalPulses.current[pulseIndexInArray];
        if (!pulse) continue;
        const progress = (elapsed * 0.16 + pulseIndex / 3 + wireIndex * 0.037) % 1;
        pulse.position.copy(curve.getPointAt(progress));
      }
    });
  });

  const selectStage = (event: ThreeEvent<MouseEvent>, id: StageId) => {
    event.stopPropagation();
    onStageSelect(id);
  };

  return (
    <>
      <color attach="background" args={['#f8fbff']} />
      <fog attach="fog" args={['#f8fbff', 16, 31]} />
      <ambientLight intensity={1.65} />
      <hemisphereLight args={['#ffffff', '#d6e8f5', 1.15]} />
      <directionalLight position={[7, 10, 8]} intensity={2.5} color="#fff8ed" />
      <directionalLight position={[-7, 2, -6]} intensity={1.4} color="#bfedff" />
      <pointLight position={[0, 3, 4]} intensity={17} distance={14} color="#b5f6e7" />

      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[2.9, 1.5, 6.65, 72, 1, true]} />
        <meshPhysicalMaterial
          color="#b8d7e8"
          metalness={0.22}
          roughness={0.16}
          transmission={0.24}
          transparent
          opacity={shieldOpacity}
          side={THREE.DoubleSide}
          depthWrite={false}
          clearcoat={0.9}
          clearcoatRoughness={0.12}
        />
      </mesh>
      <mesh position={[0, 0.08, 0]}>
        <cylinderGeometry args={[2.47, 1.18, 5.95, 64, 1, true]} />
        <meshPhysicalMaterial
          color="#d9eaf3"
          metalness={0.15}
          roughness={0.22}
          transparent
          opacity={shieldOpacity * 0.36}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      <group ref={modelGroup}>
      {STAGES.map((layout, index) => {
        const telemetry = stages.find((stage) => stage.id === layout.id);
        const selected = selectedStageId === layout.id;
        const hovered = hoveredStage === layout.id;
        const plateStatusColor = telemetry?.status === 'abnormal'
          ? '#ef4444'
          : telemetry?.status === 'warning'
          ? '#f59e0b'
          : '#10b981';
        const rimColor = hasFault || telemetry?.status === 'abnormal'
          ? '#ef4444'
          : selected
            ? '#06b6d4'
            : plateStatusColor;

        return (
          <group
            key={layout.id}
            ref={(element) => {
              plateGroups.current[index] = element;
            }}
            position={[0, layout.y, 0]}
            onPointerOver={(event) => {
              event.stopPropagation();
              setHoveredStage(layout.id);
            }}
            onPointerOut={() => setHoveredStage(null)}
            onClick={(event) => selectStage(event, layout.id)}
          >
            <mesh>
              <cylinderGeometry args={[layout.radius, layout.radius * 0.985, 0.18, 64]} />
              <meshStandardMaterial
                color="#8b5a2b"
                metalness={0.76}
                roughness={0.29}
                emissive={selected || hovered ? '#3a210d' : '#000000'}
                emissiveIntensity={selected ? 0.28 : hovered ? 0.16 : 0}
              />
            </mesh>
            <mesh position={[0, 0.1, 0]}>
              <torusGeometry args={[layout.radius * 0.99, selected ? 0.055 : 0.032, 10, 72]} />
              <meshStandardMaterial
                color={rimColor}
                emissive={rimColor}
                emissiveIntensity={selected || telemetry?.status === 'abnormal' ? 1.1 : 0.32}
                metalness={0.28}
                roughness={0.28}
              />
            </mesh>
            <mesh position={[0, -0.105, 0]}>
              <cylinderGeometry args={[layout.radius * 0.93, layout.radius * 0.96, 0.055, 64]} />
              <meshStandardMaterial color="#5f3c20" metalness={0.7} roughness={0.38} />
            </mesh>
            <mesh position={[layout.radius * 0.66, 0.105, layout.radius * 0.48]}>
              <cylinderGeometry args={[0.065, 0.065, 0.025, 20]} />
              <meshBasicMaterial color={plateStatusColor} />
            </mesh>
            <sprite
              position={[layout.radius + 1.25, 0.02, 0]}
              scale={[2.5, 0.47, 1]}
              renderOrder={10}
            >
              <spriteMaterial
                attach="material"
                map={stageLabelTextures[index]}
                transparent
                depthTest={false}
                toneMapped={false}
              />
            </sprite>
          </group>
        );
      })}

      {[0, 1, 2, 3].map((index) => {
        const angle = (index * Math.PI) / 2 + Math.PI / 4;
        const radius = 1.78;
        return (
          <group key={`support-${index}`} position={[Math.cos(angle) * radius, 0.02, Math.sin(angle) * radius]}>
            <mesh>
              <cylinderGeometry args={[0.055, 0.055, 5.7, 16]} />
              <meshStandardMaterial color="#9aa8b3" metalness={0.9} roughness={0.22} />
            </mesh>
            {STAGES.map((stage) => (
              <mesh key={`collar-${stage.id}`} position={[0, stage.y - 0.02, 0]}>
                <cylinderGeometry args={[0.09, 0.09, 0.1, 16]} />
                <meshStandardMaterial color="#bd9561" metalness={0.82} roughness={0.25} />
              </mesh>
            ))}
          </group>
        );
      })}

      {wires.map((curve, index) => (
        <mesh key={`rf-line-${index}`} geometry={new THREE.TubeGeometry(curve, 56, 0.018, 6, false)}>
          <meshStandardMaterial
            color={statusColor}
            emissive={statusColor}
            emissiveIntensity={wireStatus === 'danger' ? 1.15 : 0.58}
            metalness={0.24}
            roughness={0.22}
          />
        </mesh>
      ))}

      {wires.flatMap((_, wireIndex) =>
        Array.from({ length: 3 }, (_, pulseIndex) => {
          const pulseIndexInArray = wireIndex * 3 + pulseIndex;
          return (
            <mesh
              key={`signal-pulse-${wireIndex}-${pulseIndex}`}
              ref={(mesh) => {
                signalPulses.current[pulseIndexInArray] = mesh;
              }}
            >
              <sphereGeometry args={[wireStatus === 'danger' ? 0.055 : 0.04, 10, 10]} />
              <meshBasicMaterial color={statusColor} toneMapped={false} />
            </mesh>
          );
        }),
      )}

      <group position={[0, -3.36, 0]}>
        <mesh position={[0, -0.02, 0]}>
          <boxGeometry args={[1.62, 0.16, 1.18]} />
          <meshStandardMaterial color="#172b3b" metalness={0.72} roughness={0.26} />
        </mesh>
        <mesh position={[0, 0.065, 0]}>
          <boxGeometry args={[1.43, 0.035, 0.98]} />
          <meshStandardMaterial color="#071b2b" metalness={0.64} roughness={0.24} />
        </mesh>
        {Array.from({ length: 16 }, (_, index) => {
          const row = Math.floor(index / 4);
          const col = index % 4;
          const selected = [1, 2, 5, 6, 9, 10, 13, 14].includes(index);
          return (
            <group key={`qubit-${index}`} position={[-0.48 + col * 0.32, 0.09, -0.33 + row * 0.22]}>
              <mesh>
                <boxGeometry args={[0.105, 0.025, 0.105]} />
                <meshStandardMaterial
                  color={selected ? '#20e0d0' : '#1886b3'}
                  emissive={selected ? '#00dacb' : '#08719b'}
                  emissiveIntensity={selected ? 0.7 : 0.32}
                  metalness={0.38}
                  roughness={0.24}
                />
              </mesh>
              {selected && (
                <mesh position={[0, 0.018, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                  <torusGeometry args={[0.085, 0.012, 6, 24]} />
                  <meshBasicMaterial color="#00d9ff" />
                </mesh>
              )}
            </group>
          );
        })}
        <sprite position={[1.45, 0.12, 0]} scale={[2.5, 0.47, 1]} renderOrder={10}>
          <spriteMaterial
            attach="material"
            map={qpuLabelTexture}
            transparent
            depthTest={false}
            toneMapped={false}
          />
        </sprite>
      </group>

      </group>
      <gridHelper args={[16, 32, '#9cc9e6', '#dbeaf5']} position={[0, -3.86, 0]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3.875, 0]}>
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial color="#f7fbff" transparent opacity={0.35} />
      </mesh>
      <CameraMotion view={view} />

    </>
  );
}

export function CryostatStack3D(props: CryostatStack3DProps) {
  const [shieldOpacity, setShieldOpacity] = useState(0.5);
  const [view, setView] = useState<CameraView>('overview');
  const [autoRotate, setAutoRotate] = useState(true);
  const wireStatus = props.hasFault || props.stages.some((stage) => stage.status === 'abnormal')
    ? 'danger'
    : props.stages.some((stage) => stage.status === 'warning')
      ? 'monitor'
      : 'safe';

  return (
    <div className="relative h-[640px] overflow-hidden rounded-2xl border border-slate-200 bg-[#f8fbff] lg:h-[720px]">
      <div className="pointer-events-none absolute inset-x-4 top-4 z-10 flex flex-wrap items-start justify-between gap-3">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur">
          <span className={`flex items-center gap-1.5 rounded-md px-2 py-1 font-mono-tech text-[10px] font-bold ${
            wireStatus === 'safe' ? 'bg-emerald-50 text-emerald-800' : wireStatus === 'monitor' ? 'bg-amber-50 text-amber-800' : 'bg-rose-50 text-rose-800'
          }`}>
            <span className={`h-2 w-2 rounded-full ${
              wireStatus === 'safe' ? 'bg-emerald-500' : wireStatus === 'monitor' ? 'bg-amber-400' : 'bg-rose-500'
            }`} />
            WIRE STATUS: {wireStatus === 'safe' ? 'SAFE / READY' : wireStatus.toUpperCase()}
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
            onClick={() => setView('chip')}
            className="rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1.5 font-mono-tech text-[10px] font-semibold text-sky-800 transition-colors hover:bg-sky-100"
          >
            Focus Chip
          </button>
          <button
            type="button"
            onClick={() => setView('overview')}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-mono-tech text-[10px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => setAutoRotate((rotating) => !rotating)}
            aria-pressed={autoRotate}
            className={`rounded-md border px-2.5 py-1.5 font-mono-tech text-[10px] font-semibold transition-colors ${
              autoRotate
                ? 'border-cyan-200 bg-cyan-50 text-cyan-800'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {autoRotate ? '360° Rotation On' : '360° Rotation Off'}
          </button>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white/90 px-3 py-2 font-mono-tech text-[9px] font-bold uppercase tracking-wider text-slate-600 shadow-sm">
          Drag to orbit · Scroll to zoom · Click a stage to inspect
        </div>
      </div>

      <Canvas
        camera={{ position: [7.9, 4.2, 11.4], fov: 39, near: 0.1, far: 100 }}
        dpr={[1, 1.75]}
        aria-label="Interactive 3D dilution refrigerator digital twin"
      >
        <CryostatScene {...props} autoRotate={autoRotate} wireStatus={wireStatus} shieldOpacity={shieldOpacity} view={view} />
      </Canvas>

      <div className="pointer-events-none absolute bottom-4 left-4 z-10 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-white/95 p-2.5 font-mono-tech text-[10px] shadow-sm backdrop-blur">
        <span className="font-bold uppercase tracking-wider text-slate-700">Signal Legend:</span>
        <span className="flex items-center gap-1.5 text-emerald-800">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          Ready (≥85)
        </span>
        <span className="flex items-center gap-1.5 text-amber-800">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          Monitor (65–84)
        </span>
        <span className="flex items-center gap-1.5 text-rose-800">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
          Danger (&lt;65)
        </span>
        <span className="hidden text-slate-300 sm:inline">|</span>
        <span className="font-bold text-cyan-800">Cyan Rings: QAOA Selected</span>
      </div>
      <div className="pointer-events-none absolute bottom-4 right-4 z-10 hidden rounded-lg border border-slate-200 bg-white/90 px-3 py-2 font-mono-tech text-[9px] font-bold tracking-wider text-slate-500 shadow-sm md:block">
        SIMULATED CRYOGENIC ENVIRONMENT
      </div>
    </div>
  );
}
