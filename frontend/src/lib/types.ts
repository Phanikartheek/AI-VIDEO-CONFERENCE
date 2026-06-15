/**
 * Shared types for the FocusMeet 3D meeting room.
 */
import type * as THREE from 'three';

/** Represents a single participant in the 3D room */
export interface RoomParticipant {
  id: string;
  name: string;
  role: 'host' | 'co_host' | 'participant' | 'viewer';
  engagementScore: number;      // 0–100
  isSpeaking: boolean;
  videoTexture: THREE.CanvasTexture | null;
  audioTrack: MediaStreamTrack | null;
  hasVideo: boolean;
  hasAudio: boolean;
  joinedAt: number;             // timestamp for enter animation
}

/** Connection state exposed by useLiveKitRoom */
export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed';

/** Result of useLiveKitRoom hook */
export interface LiveKitRoomState {
  participants: RoomParticipant[];
  localParticipant: RoomParticipant | null;
  connectionState: ConnectionState;
  isMicEnabled: boolean;
  isCamEnabled: boolean;
  toggleMic: () => void;
  toggleCam: () => void;
  disconnect: () => void;
  error: string | null;
  localVideoTrack: MediaStreamTrack | null;
}

/** Alert message for the 3D AlertPanel */
export interface AlertMessage {
  id: string;
  text: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: number;
}

/** Per-participant drop-off risk alert (host-only, positioned near their card) */
export interface DropoffAlert {
  id: string;
  userId: string;
  userName: string;
  currentScore: number;
  trend: 'declining';
  /** World-space position to spawn the alert near the participant card */
  position: [number, number, number];
  createdAt: number;
}

/* ─── Focus detection & engagement ────────────────────────── */

export interface FocusDetectionResult {
  focusScore: number;       // % time focused in rolling 30s window (0–100)
  isFocused: boolean;       // focused in the current frame
  faceDetected: boolean;    // false after 5s with no face
  loading: boolean;         // model still loading
  error: string | null;     // model load / inference error
  // debug signals
  ear: number;
  yaw: number;              // degrees
  pitch: number;            // degrees
}

export interface EngagementBreakdown {
  video: number;
  mic: number;
  typing: number;
  chat: number;
}

export interface EngagementFusionConfig {
  micWeight?: number;
  typingWeight?: number;
  chatWeight?: number;
}

export interface EngagementFusionResult {
  engagementScore: number;          // final 0–100
  breakdown: EngagementBreakdown;   // per-signal normalized scores
  faceDetected: boolean;
}

/* ─── Reports ──────────────────────────────────────────────── */

export interface ReportRow {
  name: string;
  score: number;
  breakdown: EngagementBreakdown;
}

export interface MeetingReport {
  meeting_id: string;
  participants: ReportRow[];
}
