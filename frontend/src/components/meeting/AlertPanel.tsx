/**
 * AlertPanel — 3D floating panel that slides in from the top
 * with a fade-in animation when visible=true.
 * Renders at a fixed screen-space position above the scene.
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';

interface AlertPanelProps {
  visible: boolean;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
}

const typeColors = {
  info:    new THREE.Color('#6366f1'),
  success: new THREE.Color('#22c55e'),
  warning: new THREE.Color('#eab308'),
  error:   new THREE.Color('#ef4444'),
};

export default function AlertPanel({
  visible,
  message,
  type = 'info',
}: AlertPanelProps) {
  const groupRef = useRef<THREE.Group>(null!);
  const progressRef = useRef(0);
  const color = typeColors[type];

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    const target = visible ? 1 : 0;
    progressRef.current = THREE.MathUtils.damp(
      progressRef.current,
      target,
      5,
      delta,
    );

    const p = progressRef.current;

    // Slide from above (y offset) + fade (scale)
    groupRef.current.position.y = 3.5 - (1 - p) * 1.5;
    groupRef.current.scale.setScalar(Math.max(0.001, p));

    // Also fade opacity on the materials
    groupRef.current.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const mat = child.material as THREE.MeshStandardMaterial;
        if (mat.transparent !== undefined) {
          mat.opacity = p * (mat.userData.baseOpacity ?? 1);
        }
      }
    });
  });

  return (
    <group ref={groupRef} position={[0, 3.5, 0]}>
      {/* Panel background */}
      <RoundedBox
        args={[4.5, 0.6, 0.05]}
        radius={0.08}
        smoothness={4}
      >
        <meshStandardMaterial
          color="#0f0f23"
          transparent
          opacity={0.92}
          userData={{ baseOpacity: 0.92 }}
        />
      </RoundedBox>

      {/* Left accent bar */}
      <mesh position={[-2.1, 0, 0.03]}>
        <planeGeometry args={[0.06, 0.45]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={1.5}
          transparent
          opacity={1}
          toneMapped={false}
          userData={{ baseOpacity: 1 }}
        />
      </mesh>

      {/* Message text */}
      <Text
        position={[0, 0, 0.04]}
        fontSize={0.14}
        color="#e0e7ff"
        anchorX="center"
        anchorY="middle"
        maxWidth={3.8}
      >
        {message}
      </Text>

      {/* Type icon dot */}
      <mesh position={[-1.95, 0, 0.04]}>
        <circleGeometry args={[0.06, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={2}
          transparent
          opacity={1}
          toneMapped={false}
          userData={{ baseOpacity: 1 }}
        />
      </mesh>
    </group>
  );
}
