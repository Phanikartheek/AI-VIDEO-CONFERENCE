/**
 * useDemoParticipants — generates realistic simulated participants
 * for the 3D meeting room demo. Cycles speaking state, engagement
 * scores, and simulates join/leave events.
 *
 * Each participant gets a unique CanvasTexture with animated content.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import type { RoomParticipant, ConnectionState, AlertMessage } from '../lib/types';

const DEMO_USERS = [
  { name: 'Alex Chen', initials: 'AC', hue: 230 },
  { name: 'Sarah Kim', initials: 'SK', hue: 280 },
  { name: 'Mike Torres', initials: 'MT', hue: 160 },
  { name: 'Priya Patel', initials: 'PP', hue: 340 },
  { name: 'James Liu', initials: 'JL', hue: 200 },
  { name: 'Emma Davis', initials: 'ED', hue: 30 },
];

/** Create an animated canvas that simulates a webcam feed */
function createDemoTexture(
  name: string,
  initials: string,
  hue: number,
): { texture: THREE.CanvasTexture; canvas: HTMLCanvasElement; cleanup: () => void } {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext('2d')!;

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;

  let frame = 0;
  let raf = 0;
  let lastDrawTime = 0;
  const FRAME_INTERVAL = 1000 / 20; // Throttle to ~20fps to save CPU/GPU

  const draw = (now: number) => {
    raf = requestAnimationFrame(draw);
    if (now - lastDrawTime < FRAME_INTERVAL) return;
    lastDrawTime = now;

    frame++;
    const t = frame * 0.02;

    // Animated gradient background
    const g = ctx.createRadialGradient(
      320 + Math.sin(t) * 40,
      240 + Math.cos(t * 0.7) * 30,
      0,
      320,
      240,
      360,
    );
    g.addColorStop(0, `hsl(${hue}, 40%, 18%)`);
    g.addColorStop(0.5, `hsl(${hue}, 30%, 10%)`);
    g.addColorStop(1, `hsl(${hue}, 20%, 5%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 640, 480);

    // Animated subtle grid
    ctx.strokeStyle = `hsla(${hue}, 50%, 30%, 0.08)`;
    ctx.lineWidth = 1;
    for (let x = 0; x < 640; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 480);
      ctx.stroke();
    }
    for (let y = 0; y < 480; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(640, y);
      ctx.stroke();
    }

    // Floating particles
    for (let i = 0; i < 8; i++) {
      const px = (Math.sin(t * 0.3 + i * 1.7) * 0.5 + 0.5) * 640;
      const py = (Math.cos(t * 0.25 + i * 2.1) * 0.5 + 0.5) * 480;
      ctx.beginPath();
      ctx.arc(px, py, 2 + Math.sin(t + i) * 1, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue}, 60%, 60%, ${0.2 + Math.sin(t + i) * 0.1})`;
      ctx.fill();
    }

    // Avatar silhouette (head + shoulders)
    const headY = 190 + Math.sin(t * 0.8) * 4;
    // Shoulders
    ctx.beginPath();
    ctx.ellipse(320, 380, 120, 80, 0, Math.PI, 0, true);
    ctx.fillStyle = `hsl(${hue}, 35%, 25%)`;
    ctx.fill();
    // Head
    ctx.beginPath();
    ctx.arc(320, headY, 65, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${hue}, 30%, 35%)`;
    ctx.fill();
    // Initials on head
    ctx.fillStyle = `hsl(${hue}, 50%, 80%)`;
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials, 320, headY);

    // Name at bottom
    ctx.fillStyle = `hsla(${hue}, 40%, 80%, 0.8)`;
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(name, 320, 440);

    // Subtle animated waveform if "speaking"
    const isSpeaking = Math.sin(t * 0.5) > 0.3;
    if (isSpeaking) {
      ctx.strokeStyle = `hsla(${hue}, 70%, 60%, 0.5)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 180; x < 460; x += 3) {
        const y = 440 + Math.sin(x * 0.05 + t * 4) * (6 + Math.sin(t * 2) * 3);
        if (x === 180) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    texture.needsUpdate = true;
  };

  raf = requestAnimationFrame(draw);

  const cleanup = () => {
    cancelAnimationFrame(raf);
    texture.dispose();
  };

  return { texture, canvas, cleanup };
}

interface DemoState {
  participants: RoomParticipant[];
  connectionState: ConnectionState;
  alerts: AlertMessage[];
  isMicEnabled: boolean;
  isCamEnabled: boolean;
}

export function useDemoParticipants(localEngagementScore?: number) {
  const [state, setState] = useState<DemoState>({
    participants: [],
    connectionState: 'disconnected',
    alerts: [],
    isMicEnabled: true,
    isCamEnabled: true,
  });

  const [localParticipant, setLocalParticipant] = useState<RoomParticipant | null>(null);

  const texturesRef = useRef<Map<string, { texture: THREE.CanvasTexture; cleanup: () => void }>>(new Map());
  const alertTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Webcam refs
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localTextureRef = useRef<THREE.CanvasTexture | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localRafRef = useRef<number>(0);

  const stopLocalCamera = useCallback(() => {
    if (localRafRef.current) cancelAnimationFrame(localRafRef.current);
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    localTextureRef.current?.dispose();
    localTextureRef.current = null;
    localVideoRef.current = null;
    setLocalParticipant(null);
  }, []);

  const startLocalCamera = useCallback(async () => {
    stopLocalCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, frameRate: 24 },
        audio: false,
      });
      localStreamRef.current = stream;

      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;
      await video.play().catch(() => {});
      localVideoRef.current = video;

      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, 640, 480);

      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.colorSpace = THREE.SRGBColorSpace;
      localTextureRef.current = texture;

      const drawLocal = () => {
        if (video.readyState >= video.HAVE_CURRENT_DATA) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          texture.needsUpdate = true;
        }
        localRafRef.current = requestAnimationFrame(drawLocal);
      };
      localRafRef.current = requestAnimationFrame(drawLocal);

      setLocalParticipant({
        id: 'local-user',
        name: 'You (Host)',
        role: 'host',
        engagementScore: localEngagementScore !== undefined ? localEngagementScore : 100,
        isSpeaking: false,
        videoTexture: texture,
        audioTrack: null,
        hasVideo: true,
        hasAudio: false,
        joinedAt: Date.now(),
      });
    } catch (err) {
      console.error('Failed to access local webcam for demo:', err);
    }
  }, [localEngagementScore, stopLocalCamera]);

  const addAlert = useCallback((text: string, type: AlertMessage['type'] = 'info') => {
    const alert: AlertMessage = { id: `alert-${Date.now()}-${Math.random().toString(36).slice(2)}`, text, type, timestamp: Date.now() };
    setState((s) => ({ ...s, alerts: [alert] }));
    if (alertTimeoutRef.current) clearTimeout(alertTimeoutRef.current);
    alertTimeoutRef.current = setTimeout(() => {
      setState((s) => ({ ...s, alerts: [] }));
    }, 4000);
  }, []);

  // Sync local score
  useEffect(() => {
    setLocalParticipant((prev) => {
      if (!prev) return null;
      const targetScore = localEngagementScore !== undefined ? localEngagementScore : 100;
      if (prev.engagementScore === targetScore) return prev;
      return { ...prev, engagementScore: targetScore };
    });
  }, [localEngagementScore]);

  // Simulate connection sequence
  useEffect(() => {
    // Phase 1: connecting
    setState((s) => ({ ...s, connectionState: 'connecting' }));

    const t1 = setTimeout(() => {
      setState((s) => ({ ...s, connectionState: 'connected' }));
      addAlert('Connected to FocusMeet room', 'success');
    }, 1500);

    // Phase 2: participants join staggered
    const joinTimers: ReturnType<typeof setTimeout>[] = [];

    DEMO_USERS.forEach((user, i) => {
      const delay = 2500 + i * 1800;
      const timer = setTimeout(() => {
        const key = `demo-${user.name}`;
        if (!texturesRef.current.has(key)) {
          const { texture, cleanup } = createDemoTexture(user.name, user.initials, user.hue);
          texturesRef.current.set(key, { texture, cleanup });
        }
        const texEntry = texturesRef.current.get(key)!;

        const participant: RoomParticipant = {
          id: key,
          name: user.name,
          role: i === 0 ? 'host' : 'participant',
          engagementScore: Math.round(40 + Math.random() * 55),
          isSpeaking: false,
          videoTexture: texEntry.texture,
          audioTrack: null,
          hasVideo: true,
          hasAudio: true,
          joinedAt: Date.now(),
        };

        setState((s) => ({
          ...s,
          participants: [...s.participants, participant],
        }));
        addAlert(`${user.name} joined the meeting`, 'info');
      }, delay);
      joinTimers.push(timer);
    });

    // Phase 3: cycle speaking & engagement
    const cycleInterval = setInterval(() => {
      setState((s) => ({
        ...s,
        participants: s.participants.map((p) => ({
          ...p,
          isSpeaking: Math.random() > 0.7,
          engagementScore: Math.max(
            10,
            Math.min(100, p.engagementScore + Math.round((Math.random() - 0.4) * 15)),
          ),
        })),
      }));
    }, 2500);

    return () => {
      clearTimeout(t1);
      joinTimers.forEach(clearTimeout);
      clearInterval(cycleInterval);
      if (alertTimeoutRef.current) clearTimeout(alertTimeoutRef.current);
      texturesRef.current.forEach((entry) => entry.cleanup());
      texturesRef.current.clear();
      stopLocalCamera();
    };
  }, [addAlert, stopLocalCamera]);

  // Start webcam when connected and enabled
  useEffect(() => {
    if (state.connectionState === 'connected') {
      if (state.isCamEnabled) {
        startLocalCamera();
      } else {
        stopLocalCamera();
      }
    }
  }, [state.connectionState, state.isCamEnabled, startLocalCamera, stopLocalCamera]);

  const toggleMic = useCallback(() => {
    setState((s) => {
      const next = !s.isMicEnabled;
      return { ...s, isMicEnabled: next };
    });
  }, []);

  const toggleCam = useCallback(() => {
    setState((s) => {
      const next = !s.isCamEnabled;
      return { ...s, isCamEnabled: next };
    });
  }, []);

  const disconnect = useCallback(() => {
    setState((s) => ({ ...s, connectionState: 'disconnected', participants: [] }));
    texturesRef.current.forEach((entry) => entry.cleanup());
    texturesRef.current.clear();
    stopLocalCamera();
  }, [stopLocalCamera]);

  const localVideoTrack = localParticipant ? (localStreamRef.current?.getVideoTracks()[0] ?? null) : null;

  return {
    participants: state.participants,
    localParticipant,
    connectionState: state.connectionState,
    alerts: state.alerts,
    isMicEnabled: state.isMicEnabled,
    isCamEnabled: state.isCamEnabled,
    toggleMic,
    toggleCam,
    disconnect,
    error: null,
    localVideoTrack,
  };
}
