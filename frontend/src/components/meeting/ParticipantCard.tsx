/**
 * ParticipantCard — a 3D plane showing video as a CanvasTexture,
 * surrounded by a glowing emissive ring that interpolates
 * red(0) → yellow(50) → green(100) based on engagementScore.
 *
 * Floating <Text> label from drei shows name + live score.
 * Gentle idle rotation/float via useFrame with damping.
 */
import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import type { RoomParticipant } from '../../lib/types';

interface ParticipantCardProps {
  participant: RoomParticipant;
  position: [number, number, number];
  lookAt: [number, number, number];
  index: number;
  enterProgress: number; // 0→1 for enter animation
}

/* ── engagement color: red(0) → yellow(50) → green(100) ── */
const colorLow  = new THREE.Color('#ef4444'); // red
const colorMid  = new THREE.Color('#eab308'); // yellow
const colorHigh = new THREE.Color('#22c55e'); // green

function getEngagementColor(score: number): THREE.Color {
  const t = Math.max(0, Math.min(100, score)) / 100;
  const c = new THREE.Color();
  if (t < 0.5) {
    c.copy(colorLow).lerp(colorMid, t * 2);
  } else {
    c.copy(colorMid).lerp(colorHigh, (t - 0.5) * 2);
  }
  return c;
}

/* ── card dimensions ─────────────────────────────────────── */
const CARD_W = 2.0;
const CARD_H = 1.5;
const FRAME_THICKNESS = 0.06;

export default function ParticipantCard({
  participant,
  position,
  lookAt,
  index,
  enterProgress,
}: ParticipantCardProps) {
  const groupRef = useRef<THREE.Group>(null!);
  const ringRef = useRef<THREE.Mesh>(null!);
  const speakGlow = useRef(0);
  const targetY = useRef(position[1]);
  const currentY = useRef(position[1]);

  const engagementColor = useMemo(
    () => getEngagementColor(participant.engagementScore),
    [participant.engagementScore],
  );

  /* ── Placeholder texture when no video ─────────────────── */
  const placeholderTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d')!;

    // Dark gradient background
    const grad = ctx.createRadialGradient(320, 240, 0, 320, 240, 320);
    grad.addColorStop(0, '#1e1b4b');
    grad.addColorStop(1, '#0f0a1e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 640, 480);

    // Avatar circle
    ctx.beginPath();
    ctx.arc(320, 210, 60, 0, Math.PI * 2);
    ctx.fillStyle = '#4338ca';
    ctx.fill();

    // Initial letter
    ctx.fillStyle = '#e0e7ff';
    ctx.font = 'bold 48px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      (participant.name || '?').charAt(0).toUpperCase(),
      320,
      210,
    );

    // Name
    ctx.font = '20px sans-serif';
    ctx.fillStyle = '#a5b4fc';
    ctx.fillText(participant.name || 'Unknown', 320, 310);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [participant.name]);

  // Dispose placeholder texture on unmount or name change to prevent GPU memory leaks
  useEffect(() => {
    return () => {
      placeholderTexture.dispose();
    };
  }, [placeholderTexture]);

  const videoTex = participant.videoTexture ?? placeholderTexture;

  /* ── per-frame animation ───────────────────────────────── */
  useFrame((state, delta) => {
    if (!groupRef.current) return;

    const t = state.clock.elapsedTime;

    // Gentle float
    targetY.current = position[1] + Math.sin(t * 0.6 + index * 1.7) * 0.08;
    currentY.current = THREE.MathUtils.damp(currentY.current, targetY.current, 4, delta);
    groupRef.current.position.y = currentY.current;

    // Subtle tilt
    groupRef.current.rotation.z = Math.sin(t * 0.3 + index * 2.1) * 0.015;

    // Enter animation: scale up from 0
    const s = THREE.MathUtils.damp(
      groupRef.current.scale.x,
      enterProgress,
      6,
      delta,
    );
    groupRef.current.scale.setScalar(s);

    // Speaking glow pulse
    const targetGlow = participant.isSpeaking ? 1.0 : 0.0;
    speakGlow.current = THREE.MathUtils.damp(speakGlow.current, targetGlow, 5, delta);

    // Ring emissive intensity
    if (ringRef.current) {
      const mat = ringRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.6 + speakGlow.current * 1.2 + Math.sin(t * 3) * 0.1;
    }

    // Face center
    groupRef.current.lookAt(lookAt[0], lookAt[1], lookAt[2]);
  });

  return (
    <group ref={groupRef} position={position}>
      {/* ── Glowing ring / frame ─────────────────────────── */}
      <mesh ref={ringRef} position={[0, 0, -0.02]}>
        <planeGeometry args={[CARD_W + FRAME_THICKNESS * 2, CARD_H + FRAME_THICKNESS * 2]} />
        <meshStandardMaterial
          color={engagementColor}
          emissive={engagementColor}
          emissiveIntensity={0.6}
          transparent
          opacity={0.85}
          toneMapped={false}
        />
      </mesh>

      {/* ── Soft outer glow (larger, faint) ──────────────── */}
      <mesh position={[0, 0, -0.04]}>
        <planeGeometry args={[CARD_W + 0.4, CARD_H + 0.4]} />
        <meshStandardMaterial
          color={engagementColor}
          emissive={engagementColor}
          emissiveIntensity={0.3}
          transparent
          opacity={0.15 + speakGlow.current * 0.15}
          toneMapped={false}
        />
      </mesh>

      {/* ── Video plane ──────────────────────────────────── */}
      <mesh position={[0, 0, 0]}>
        <planeGeometry args={[CARD_W, CARD_H]} />
        <meshBasicMaterial map={videoTex} toneMapped={false} />
      </mesh>

      {/* ── Dark backing ─────────────────────────────────── */}
      <RoundedBox
        args={[CARD_W + 0.12, CARD_H + 0.12, 0.04]}
        radius={0.04}
        smoothness={4}
        position={[0, 0, -0.05]}
      >
        <meshStandardMaterial color="#0a0a1a" roughness={0.9} metalness={0.1} />
      </RoundedBox>

      {/* ── Name label ───────────────────────────────────── */}
      <Text
        position={[0, -(CARD_H / 2) - 0.18, 0]}
        fontSize={0.12}
        color="#e0e7ff"
        anchorX="center"
        anchorY="top"
        font="/fonts/inter-medium.woff"
        maxWidth={CARD_W}
      >
        {participant.name}
      </Text>

      {/* ── Engagement score badge ───────────────────────── */}
      <group position={[CARD_W / 2 - 0.15, CARD_H / 2 - 0.15, 0.02]}>
        <mesh>
          <circleGeometry args={[0.12, 32]} />
          <meshStandardMaterial
            color={engagementColor}
            emissive={engagementColor}
            emissiveIntensity={0.8}
            toneMapped={false}
          />
        </mesh>
        <Text
          position={[0, 0, 0.01]}
          fontSize={0.08}
          color="#fff"
          anchorX="center"
          anchorY="middle"
        >
          {participant.engagementScore.toString()}
        </Text>
      </group>

      {/* ── Speaking indicator ───────────────────────────── */}
      {participant.isSpeaking && (
        <group position={[-(CARD_W / 2) + 0.15, CARD_H / 2 - 0.15, 0.02]}>
          <mesh>
            <circleGeometry args={[0.06, 16]} />
            <meshStandardMaterial
              color="#22c55e"
              emissive="#22c55e"
              emissiveIntensity={2}
              toneMapped={false}
            />
          </mesh>
        </group>
      )}

      {/* ── Muted indicators ─────────────────────────────── */}
      {!participant.hasAudio && (
        <group position={[-(CARD_W / 2) + 0.15, -(CARD_H / 2) + 0.15, 0.02]}>
          <mesh>
            <circleGeometry args={[0.08, 16]} />
            <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.5} toneMapped={false} transparent opacity={0.8} />
          </mesh>
          <Text position={[0, 0, 0.01]} fontSize={0.07} color="#fff" anchorX="center" anchorY="middle">
            🔇
          </Text>
        </group>
      )}
    </group>
  );
}
