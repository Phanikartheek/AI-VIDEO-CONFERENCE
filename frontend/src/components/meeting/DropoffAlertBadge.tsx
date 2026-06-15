/**
 * DropoffAlertBadge — a small 3D panel that appears next to a participant's
 * card when the drop-off predictor flags them.
 *
 * Shows "{user_name} may be losing focus ↓" with a warning colour.
 * Slides in, holds for 8 s, then slides out automatically.
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import type { DropoffAlert } from '../../lib/types';

const DISPLAY_MS = 8000;

interface DropoffAlertBadgeProps {
  alert: DropoffAlert;
  onExpire: (id: string) => void;
}

const warnColor = new THREE.Color('#eab308');

export default function DropoffAlertBadge({ alert, onExpire }: DropoffAlertBadgeProps) {
  const groupRef = useRef<THREE.Group>(null!);
  const progressRef = useRef(0);
  const expiredRef = useRef(false);

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    const age = Date.now() - alert.createdAt;
    const entering = age < 600;
    const exiting = age > DISPLAY_MS;

    const target = entering ? 1 : exiting ? 0 : 1;
    progressRef.current = THREE.MathUtils.damp(progressRef.current, target, 6, delta);

    const p = progressRef.current;
    groupRef.current.scale.setScalar(Math.max(0.001, p));
    groupRef.current.position.y = alert.position[1] + 1.3 + (1 - p) * 0.5;

    if (exiting && p < 0.02 && !expiredRef.current) {
      expiredRef.current = true;
      onExpire(alert.id);
    }
  });

  return (
    <group
      ref={groupRef}
      position={[alert.position[0], alert.position[1] + 1.3, alert.position[2]]}
    >
      {/* Background pill */}
      <RoundedBox args={[2.6, 0.44, 0.03]} radius={0.06} smoothness={4}>
        <meshStandardMaterial
          color="#1c1917"
          transparent
          opacity={0.92}
          userData={{ baseOpacity: 0.92 }}
        />
      </RoundedBox>

      {/* Left accent bar */}
      <mesh position={[-1.2, 0, 0.02]}>
        <planeGeometry args={[0.04, 0.32]} />
        <meshStandardMaterial
          color={warnColor}
          emissive={warnColor}
          emissiveIntensity={1.5}
          toneMapped={false}
        />
      </mesh>

      {/* Warning dot */}
      <mesh position={[-1.08, 0, 0.02]}>
        <circleGeometry args={[0.04, 12]} />
        <meshStandardMaterial
          color={warnColor}
          emissive={warnColor}
          emissiveIntensity={2}
          toneMapped={false}
        />
      </mesh>

      {/* Message text */}
      <Text
        position={[0.05, 0.04, 0.02]}
        fontSize={0.1}
        color="#fde68a"
        anchorX="center"
        anchorY="middle"
        maxWidth={2.2}
      >
        {alert.userName} may be losing focus
      </Text>

      {/* Down-arrow trend indicator */}
      <Text
        position={[0.05, -0.1, 0.02]}
        fontSize={0.07}
        color="#a8a29e"
        anchorX="center"
        anchorY="middle"
      >
        ↓ score {alert.currentScore}
      </Text>
    </group>
  );
}
