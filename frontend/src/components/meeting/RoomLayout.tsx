/**
 * RoomLayout — arranges ParticipantCards in a circle facing the center.
 * Auto-adjusts radius based on participant count.
 * Handles enter/exit animations via per-participant progress tracking.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import ParticipantCard from './ParticipantCard';
import type { RoomParticipant } from '../../lib/types';

interface RoomLayoutProps {
  participants: RoomParticipant[];
}

/** Radius grows with count so cards never overlap */
function computeRadius(count: number): number {
  if (count <= 1) return 0;
  if (count <= 3) return 2.8;
  if (count <= 6) return 3.6;
  if (count <= 10) return 4.8;
  return 3.0 + count * 0.35;
}

export default function RoomLayout({ participants }: RoomLayoutProps) {
  /* Track animation progress per participant id: 0 → 1 */
  const progressRef = useRef<Map<string, number>>(new Map());
  /* Track which IDs we've seen so we can animate in */
  const knownIdsRef = useRef<Set<string>>(new Set());

  /* Register new participants, mark for enter anim */
  participants.forEach((p) => {
    if (!knownIdsRef.current.has(p.id)) {
      knownIdsRef.current.add(p.id);
      progressRef.current.set(p.id, 0);
    }
  });

  /* Advance all progress values toward 1 */
  useFrame((_, delta) => {
    progressRef.current.forEach((val, key) => {
      if (val < 1) {
        progressRef.current.set(
          key,
          THREE.MathUtils.damp(val, 1, 4, delta),
        );
      }
    });
  });

  /* Compute positions */
  const count = participants.length;
  const radius = computeRadius(count);
  const center: [number, number, number] = [0, 0, 0];

  const positions = useMemo(() => {
    return participants.map((_, i) => {
      if (count === 1) {
        return [0, 0.2, -radius] as [number, number, number];
      }
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
      return [
        Math.cos(angle) * radius,
        0.2,
        Math.sin(angle) * radius,
      ] as [number, number, number];
    });
  }, [count, radius, participants]);

  return (
    <group>
      {participants.map((participant, i) => (
        <ParticipantCard
          key={participant.id}
          participant={participant}
          position={positions[i]}
          lookAt={center}
          index={i}
          enterProgress={progressRef.current.get(participant.id) ?? 1}
        />
      ))}
    </group>
  );
}
