/**
 * MeetingScene — the full 3D meeting room scene.
 *
 * Dark gradient background, ambient + point lighting, floating particle field
 * using drei Sparkles. Contains RoomLayout, AlertPanel, and DropoffAlertBadges.
 * OrbitControls with restricted zoom/pan for room navigation.
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls, Sparkles, Stars } from '@react-three/drei';
import * as THREE from 'three';
import RoomLayout from './RoomLayout';
import AlertPanel from './AlertPanel';
import DropoffAlertBadge from './DropoffAlertBadge';
import FloatingReaction from './FloatingReaction';
import type { RoomParticipant, AlertMessage, DropoffAlert } from '../../lib/types';

export interface FloatingReactionData {
  id: string;
  emoji: string;
  position: [number, number, number];
}

interface MeetingSceneProps {
  participants: RoomParticipant[];
  alert: AlertMessage | null;
  dropoffAlerts?: DropoffAlert[];
  onDropoffExpire?: (id: string) => void;
  floatingReactions?: FloatingReactionData[];
  onReactionComplete?: (id: string) => void;
}

/* ── Animated floor grid ─────────────────────────────────── */
function FloorGrid() {
  const gridRef = useRef<THREE.GridHelper>(null!);

  useFrame((state) => {
    if (gridRef.current) {
      const mat = gridRef.current.material as THREE.Material;
      if ('opacity' in mat) {
        (mat as THREE.MeshBasicMaterial).opacity =
          0.08 + Math.sin(state.clock.elapsedTime * 0.5) * 0.02;
      }
    }
  });

  return (
    <gridHelper
      ref={gridRef}
      args={[30, 60, '#6366f1', '#312e81']}
      position={[0, -2, 0]}
      rotation={[0, 0, 0]}
    />
  );
}

/* ── Floating ring around the room ───────────────────────── */
function RoomRing() {
  const ringRef = useRef<THREE.Mesh>(null!);

  useFrame((state) => {
    if (ringRef.current) {
      ringRef.current.rotation.y = state.clock.elapsedTime * 0.05;
      ringRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.1) * 0.02;
    }
  });

  return (
    <mesh ref={ringRef} position={[0, -0.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[6, 0.015, 8, 128]} />
      <meshStandardMaterial
        color="#6366f1"
        emissive="#6366f1"
        emissiveIntensity={0.8}
        transparent
        opacity={0.3}
        toneMapped={false}
      />
    </mesh>
  );
}

/* ── Central orb (meeting focal point) ───────────────────── */
function CenterOrb() {
  const meshRef = useRef<THREE.Mesh>(null!);

  useFrame((state) => {
    if (meshRef.current) {
      const s = 0.15 + Math.sin(state.clock.elapsedTime * 1.5) * 0.03;
      meshRef.current.scale.setScalar(s);
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.5;
    }
  });

  return (
    <mesh ref={meshRef} position={[0, 0, 0]}>
      <icosahedronGeometry args={[1, 2]} />
      <meshStandardMaterial
        color="#818cf8"
        emissive="#6366f1"
        emissiveIntensity={2}
        wireframe
        transparent
        opacity={0.4}
        toneMapped={false}
      />
    </mesh>
  );
}

/* ── Ambient particles ───────────────────────────────────── */
function AmbientParticles() {
  return (
    <>
      <Sparkles
        count={120}
        scale={16}
        size={1.5}
        speed={0.3}
        opacity={0.3}
        color="#818cf8"
      />
      <Sparkles
        count={60}
        scale={12}
        size={2}
        speed={0.15}
        opacity={0.15}
        color="#c084fc"
      />
    </>
  );
}

/* ── Main Scene ──────────────────────────────────────────── */
export default function MeetingScene({
  participants,
  alert,
  dropoffAlerts = [],
  onDropoffExpire,
  floatingReactions = [],
  onReactionComplete,
}: MeetingSceneProps) {
  return (
    <>
      {/* ── Lighting ─────────────────────────────────────── */}
      <ambientLight intensity={0.25} color="#c7d2fe" />
      <pointLight position={[0, 8, 0]} intensity={0.6} color="#818cf8" distance={20} decay={2} />
      <pointLight position={[5, 3, 5]} intensity={0.3} color="#6366f1" distance={15} decay={2} />
      <pointLight position={[-5, 3, -5]} intensity={0.3} color="#a78bfa" distance={15} decay={2} />
      <pointLight position={[0, -3, 0]} intensity={0.15} color="#4338ca" distance={10} decay={2} />

      {/* Subtle directional for depth */}
      <directionalLight position={[3, 5, 4]} intensity={0.2} color="#e0e7ff" />

      {/* ── Background ───────────────────────────────────── */}
      <color attach="background" args={['#050510']} />
      <fog attach="fog" args={['#050510', 12, 30]} />
      <Stars radius={50} depth={40} count={800} factor={2} saturation={0.2} fade speed={0.5} />

      {/* ── Environment pieces ───────────────────────────── */}
      <FloorGrid />
      <RoomRing />
      <CenterOrb />
      <AmbientParticles />

      {/* ── Participants ─────────────────────────────────── */}
      <RoomLayout participants={participants} />

      {/* ── Global alert (center-screen) ─────────────────── */}
      <AlertPanel
        visible={!!alert}
        message={alert?.text || ''}
        type={alert?.type || 'info'}
      />

      {/* ── Per-participant drop-off alerts (near their cards) */}
      {dropoffAlerts.map((da) => (
        <DropoffAlertBadge
          key={da.id}
          alert={da}
          onExpire={onDropoffExpire || (() => {})}
        />
      ))}

      {/* ── Floating emoji reactions ──────────────────────── */}
      {floatingReactions.map((r) => (
        <FloatingReaction
          key={r.id}
          emoji={r.emoji}
          position={r.position}
          onComplete={() => onReactionComplete?.(r.id)}
        />
      ))}

      {/* ── Controls ─────────────────────────────────────── */}
      <OrbitControls
        enablePan={false}
        enableZoom={true}
        enableRotate={true}
        minDistance={3}
        maxDistance={12}
        maxPolarAngle={Math.PI / 2 + 0.3}
        minPolarAngle={0.4}
        autoRotate={participants.length === 0}
        autoRotateSpeed={0.5}
        dampingFactor={0.08}
        enableDamping
      />
    </>
  );
}
