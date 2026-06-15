/**
 * useLiveKitRoom — connects to a LiveKit room and bridges tracks into
 * Three.js CanvasTextures for 3D rendering + hidden <audio> elements.
 *
 * Returns participants[], localTracks, connectionState and media toggles.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  ConnectionState as LKConnectionState,
  Participant,
} from 'livekit-client';
import * as THREE from 'three';
import type {
  RoomParticipant,
  ConnectionState,
  LiveKitRoomState,
} from '../lib/types';

const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL || 'ws://localhost:7880';

/* ── helpers ──────────────────────────────────────────────── */

/** Map SDK connection state to our simpler union */
function mapConnectionState(s: LKConnectionState): ConnectionState {
  switch (s) {
    case LKConnectionState.Connected:    return 'connected';
    case LKConnectionState.Connecting:   return 'connecting';
    case LKConnectionState.Reconnecting: return 'reconnecting';
    case LKConnectionState.Disconnected: return 'disconnected';
    default:                             return 'disconnected';
  }
}

/** Paint a video element onto a canvas at ~24 fps and return a CanvasTexture */
function createVideoTexture(
  track: MediaStreamTrack,
): { texture: THREE.CanvasTexture; canvas: HTMLCanvasElement; video: HTMLVideoElement; raf: number } {
  const video = document.createElement('video');
  video.srcObject = new MediaStream([track]);
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.play().catch(() => {});

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

  let raf = 0;
  const draw = () => {
    if (video.readyState >= video.HAVE_CURRENT_DATA) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      texture.needsUpdate = true;
    }
    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);

  return { texture, canvas, video, raf };
}

/** Attach an audio track to a hidden <audio> element for normal playback */
function attachAudioTrack(track: MediaStreamTrack): HTMLAudioElement {
  const audio = document.createElement('audio');
  audio.srcObject = new MediaStream([track]);
  audio.autoplay = true;
  audio.style.display = 'none';
  document.body.appendChild(audio);
  audio.play().catch(() => {});
  return audio;
}

/* ── types for internal bookkeeping ──────────────────────── */

interface TrackResources {
  texture: THREE.CanvasTexture | null;
  canvas: HTMLCanvasElement | null;
  video: HTMLVideoElement | null;
  raf: number;
  audioEl: HTMLAudioElement | null;
}

/* ── hook ─────────────────────────────────────────────────── */

export function useLiveKitRoom(token: string | null, localEngagementScore?: number): LiveKitRoomState {
  const roomRef = useRef<Room | null>(null);
  const resourcesRef = useRef<Map<string, TrackResources>>(new Map());

  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [localParticipant, setLocalParticipant] = useState<RoomParticipant | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [isCamEnabled, setIsCamEnabled] = useState(true);

  const localScoreRef = useRef(localEngagementScore);
  useEffect(() => {
    localScoreRef.current = localEngagementScore;
  }, [localEngagementScore]);

  const scoresRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    setLocalParticipant((prev) => {
      if (!prev) return null;
      const targetScore = localEngagementScore !== undefined ? localEngagementScore : 100;
      if (prev.engagementScore === targetScore) return prev;
      return {
        ...prev,
        engagementScore: targetScore,
      };
    });
  }, [localEngagementScore]);

  /* ── build a RoomParticipant from a LiveKit Participant ── */
  const buildParticipant = useCallback(
    (p: Participant, isLocal: boolean): RoomParticipant => {
      const key = p.identity;
      let resources = resourcesRef.current.get(key);

      // Video
      let videoTexture: THREE.CanvasTexture | null = null;
      let hasVideo = false;
      const videoPub = Array.from(p.trackPublications.values()).find(
        (pub) => pub.track && pub.track.kind === Track.Kind.Video &&
                 pub.source === Track.Source.Camera,
      );
      if (videoPub?.track?.mediaStreamTrack) {
        hasVideo = true;
        if (!resources?.texture) {
          const res = createVideoTexture(videoPub.track.mediaStreamTrack);
          if (!resources) {
            resources = { texture: null, canvas: null, video: null, raf: 0, audioEl: null };
            resourcesRef.current.set(key, resources);
          }
          resources.texture = res.texture;
          resources.canvas = res.canvas;
          resources.video = res.video;
          resources.raf = res.raf;
        }
        videoTexture = resources?.texture ?? null;
      } else {
        // Clean up old video if track removed
        if (resources?.texture) {
          cancelAnimationFrame(resources.raf);
          resources.video?.pause();
          resources.texture.dispose();
          resources.texture = null;
          resources.canvas = null;
          resources.video = null;
          resources.raf = 0;
        }
      }

      // Audio (remote only — never create <audio> for self)
      let audioTrack: MediaStreamTrack | null = null;
      let hasAudio = false;
      const audioPub = Array.from(p.trackPublications.values()).find(
        (pub) => pub.track && pub.track.kind === Track.Kind.Audio &&
                 pub.source === Track.Source.Microphone,
      );
      if (audioPub?.track?.mediaStreamTrack) {
        hasAudio = true;
        audioTrack = audioPub.track.mediaStreamTrack;
        if (!isLocal && !resources?.audioEl) {
          if (!resources) {
            resources = { texture: null, canvas: null, video: null, raf: 0, audioEl: null };
            resourcesRef.current.set(key, resources);
          }
          resources.audioEl = attachAudioTrack(audioTrack);
        }
      }

      let engagementScore: number;
      if (isLocal) {
        engagementScore = localScoreRef.current !== undefined ? localScoreRef.current : 100;
      } else {
        let cached = scoresRef.current.get(p.identity);
        if (cached === undefined) {
          cached = Math.round(60 + Math.random() * 30);
          scoresRef.current.set(p.identity, cached);
        } else {
          // Slowly drift instead of jumps
          if (Math.random() > 0.8) {
            const delta = Math.round((Math.random() - 0.5) * 6);
            cached = Math.max(20, Math.min(100, cached + delta));
            scoresRef.current.set(p.identity, cached);
          }
        }
        engagementScore = cached;
      }

      return {
        id: p.identity,
        name: p.name || p.identity,
        role: 'participant',
        engagementScore,
        isSpeaking: p.isSpeaking,
        videoTexture,
        audioTrack,
        hasVideo,
        hasAudio,
        joinedAt: Date.now(),
      };
    },
    [],
  );

  /* ── sync all participants into React state ─────────────── */
  const syncParticipants = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;

    const local = buildParticipant(room.localParticipant, true);
    local.role = 'host'; // local user is always shown as host in their own view
    setLocalParticipant(local);

    const remotes: RoomParticipant[] = [];
    room.remoteParticipants.forEach((rp) => {
      remotes.push(buildParticipant(rp, false));
    });
    setParticipants(remotes);
  }, [buildParticipant]);

  /* ── connect / disconnect effect ────────────────────────── */
  useEffect(() => {
    if (!token) {
      setConnectionState('disconnected');
      return;
    }

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: { resolution: { width: 640, height: 480, frameRate: 24 } },
    });
    roomRef.current = room;

    // State change
    room.on(RoomEvent.ConnectionStateChanged, (state) => {
      setConnectionState(mapConnectionState(state));
    });

    // Track events
    const resync = () => syncParticipants();
    room.on(RoomEvent.TrackSubscribed, resync);
    room.on(RoomEvent.TrackUnsubscribed, resync);
    room.on(RoomEvent.TrackMuted, resync);
    room.on(RoomEvent.TrackUnmuted, resync);
    room.on(RoomEvent.ParticipantConnected, resync);
    room.on(RoomEvent.ParticipantDisconnected, (rp) => {
      // Clean up resources for departing participant
      const res = resourcesRef.current.get(rp.identity);
      if (res) {
        cancelAnimationFrame(res.raf);
        res.video?.pause();
        res.texture?.dispose();
        if (res.audioEl) {
          res.audioEl.pause();
          res.audioEl.remove();
        }
        resourcesRef.current.delete(rp.identity);
      }
      resync();
    });
    room.on(RoomEvent.ActiveSpeakersChanged, resync);
    room.on(RoomEvent.LocalTrackPublished, resync);
    room.on(RoomEvent.LocalTrackUnpublished, resync);

    // Connect
    setConnectionState('connecting');
    room
      .connect(LIVEKIT_URL, token)
      .then(() => {
        room.localParticipant.setCameraEnabled(true).catch(() => {});
        room.localParticipant.setMicrophoneEnabled(true).catch(() => {});
        syncParticipants();
      })
      .catch((err) => {
        console.error('LiveKit connection failed:', err);
        setConnectionState('failed');
      });

    return () => {
      // Cleanup all resources
      resourcesRef.current.forEach((res) => {
        cancelAnimationFrame(res.raf);
        res.video?.pause();
        res.texture?.dispose();
        if (res.audioEl) {
          res.audioEl.pause();
          res.audioEl.remove();
        }
      });
      resourcesRef.current.clear();
      room.disconnect();
      roomRef.current = null;
    };
  }, [token, syncParticipants]);

  /* ── controls ───────────────────────────────────────────── */
  const toggleMic = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    const next = !isMicEnabled;
    room.localParticipant.setMicrophoneEnabled(next).catch(() => {});
    setIsMicEnabled(next);
  }, [isMicEnabled]);

  const toggleCam = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    const next = !isCamEnabled;
    room.localParticipant.setCameraEnabled(next).catch(() => {});
    setIsCamEnabled(next);
  }, [isCamEnabled]);

  const disconnect = useCallback(() => {
    roomRef.current?.disconnect();
    setConnectionState('disconnected');
  }, []);

  return {
    participants,
    localParticipant,
    connectionState,
    isMicEnabled,
    isCamEnabled,
    toggleMic,
    toggleCam,
    disconnect,
  };
}
