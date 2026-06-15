/**
 * Bar — a single animated 3D engagement bar.
 * Grows from 0 to its target height (lerp via damp) on mount.
 * Color: red(<40) / yellow(40–70) / green(>70).
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import type { ReportRow } from '../../lib/types';

const MAX_HEIGHT = 4;

function scoreColor(score: number): THREE.Color {
  if (score < 40) return new THREE.Color('#ef4444');
  if (score <= 70) return new THREE.Color('#eab308');
  return new THREE.Color('#22c55e');
}

interface BarProps {
  position: [number, number, number];
  row: ReportRow;
  index: number;
}

function Bar({ position, row, index }: BarProps) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const labelRef = useRef<THREE.Group>(null!);
  const currentH = useRef(0);
  const targetH = (row.score / 100) * MAX_HEIGHT;
  const color = scoreColor(row.score);

  useFrame((_, delta) => {
    currentH.current = THREE.MathUtils.damp(currentH.current, targetH, 4, delta);
    const h = Math.max(0.002, currentH.current);
    if (meshRef.current) {
      meshRef.current.scale.y = h;
      meshRef.current.position.y = h / 2;
    }
    if (labelRef.current) {
      labelRef.current.position.y = h + 0.5;
    }
  });

  return (
    <group position={position}>
      {/* Bar */}
      <mesh ref={meshRef} position={[0, 0.001, 0]}>
        <boxGeometry args={[0.9, 1, 0.9]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.35}
          metalness={0.3}
          roughness={0.4}
          toneMapped={false}
        />
      </mesh>

      {/* Glow base */}
      <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.4, 1.4]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} transparent opacity={0.25} toneMapped={false} />
      </mesh>

      {/* Floating label: name + score */}
      <group ref={labelRef} position={[0, 0.5, 0]}>
        <Text
          position={[0, 0.18, 0]}
          fontSize={0.22}
          color={color}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.008}
          outlineColor="#000000"
        >
          {Math.round(row.score).toString()}
        </Text>
        <Text
          position={[0, -0.12, 0]}
          fontSize={0.14}
          color="#e0e7ff"
          anchorX="center"
          anchorY="middle"
          maxWidth={1.6}
        >
          {row.name}
        </Text>
      </group>

      {/* invisible index marker for staggering (kept for clarity) */}
      <group userData={{ index }} />
    </group>
  );
}

interface Engagement3DProps {
  rows: ReportRow[];
}

/** Pure 3D scene (no DOM) — reused inside the Canvas. */
export function Engagement3D({ rows }: Engagement3DProps) {
  const spacing = 1.5;
  const totalWidth = (rows.length - 1) * spacing;
  const startX = -totalWidth / 2;

  return (
    <group position={[0, -1.6, 0]}>
      {/* Platform */}
      <mesh position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[totalWidth + 3, 6]} />
        <meshStandardMaterial color="#0a0a1a" metalness={0.6} roughness={0.5} />
      </mesh>

      {/* Grid lines on platform */}
      <gridHelper
        args={[totalWidth + 3, 12, '#312e81', '#1e1b4b']}
        position={[0, -0.04, 0]}
      />

      {/* Bars */}
      {rows.map((row, i) => (
        <Bar
          key={`${row.name}-${i}`}
          position={[startX + i * spacing, 0, 0]}
          row={row}
          index={i}
        />
      ))}
    </group>
  );
}

export default Engagement3D;
