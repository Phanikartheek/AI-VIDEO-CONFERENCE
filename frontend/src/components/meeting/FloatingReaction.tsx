/**
 * FloatingReaction — a 3D emoji that rises from a participant's card and fades.
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';

interface FloatingReactionProps {
  emoji: string;
  position: [number, number, number];
  onComplete: () => void;
}

const DURATION = 2.0; // seconds

export default function FloatingReaction({ emoji, position, onComplete }: FloatingReactionProps) {
  const groupRef = useRef<THREE.Group>(null!);
  const elapsed = useRef(0);
  const doneRef = useRef(false);

  useFrame((_, delta) => {
    if (!groupRef.current || doneRef.current) return;
    elapsed.current += delta;
    const t = elapsed.current / DURATION;

    // Rise upward
    groupRef.current.position.y = position[1] + 1.5 + t * 1.5;
    // Fade out
    const opacity = Math.max(0, 1 - t);
    groupRef.current.scale.setScalar(0.8 + t * 0.3);

    groupRef.current.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const mat = child.material as THREE.MeshBasicMaterial;
        if (mat.opacity !== undefined) {
          mat.opacity = opacity;
        }
      }
    });

    if (t >= 1 && !doneRef.current) {
      doneRef.current = true;
      onComplete();
    }
  });

  return (
    <group ref={groupRef} position={[position[0], position[1] + 1.5, position[2]]}>
      <Text fontSize={0.35} anchorX="center" anchorY="middle" material-transparent material-opacity={1}>
        {emoji}
      </Text>
    </group>
  );
}
