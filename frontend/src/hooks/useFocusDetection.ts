/**
 * useFocusDetection — MediaPipe FaceLandmarker-based focus tracking.
 *
 *  - Loads `face_landmarker` once (GPU delegate if available, else CPU).
 *  - Runs detection on the given <video> at ~5 fps via requestAnimationFrame
 *    throttling.
 *  - Per frame computes:
 *      • EAR (eye aspect ratio) from eye landmark points -> eyesOpen
 *      • head pose (yaw, pitch) from the facial transformation matrix
 *      • focused = eyesOpen && |yaw|<20 && |pitch|<20
 *  - Maintains a rolling 30s buffer of focused booleans ->
 *      focusScore = % focused * 100
 *  - If no face is detected for 5+ seconds -> faceDetected = false (fallback).
 *
 * Returns { focusScore, isFocused, faceDetected, loading, error, ear, yaw, pitch }.
 * Cleans up its animation frame + landmarker on unmount.
 */
import { useEffect, useRef, useState } from 'react';
import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from '@mediapipe/tasks-vision';
import type { FocusDetectionResult } from '../lib/types';

/* ── tunables ─────────────────────────────────────────────── */
const DETECTION_FPS = 5;                         // target detections/sec
const DETECTION_INTERVAL_MS = 1000 / DETECTION_FPS;
const WINDOW_MS = 30_000;                        // rolling focus window
const NO_FACE_TIMEOUT_MS = 5_000;                // faceDetected -> false
const EAR_THRESHOLD = 0.18;                      // below => eyes closed
const POSE_LIMIT_DEG = 20;                       // |yaw|,|pitch| must be < this

// MediaPipe FaceMesh eye landmark indices: [outer, top, topInner, inner, botInner, bot]
const LEFT_EYE = [33, 160, 158, 133, 153, 144];
const RIGHT_EYE = [362, 385, 387, 263, 373, 380];

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm';
// Lite model variant; swap for a smaller/larger .task as needed.
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

/* ── singleton landmarker loader (loads model once) ───────── */
let landmarkerPromise: Promise<FaceLandmarker> | null = null;

async function getLandmarker(): Promise<FaceLandmarker> {
  if (landmarkerPromise) return landmarkerPromise;

  landmarkerPromise = (async () => {
    const fileset = await FilesetResolver.forVisionTasks(WASM_URL);

    // Try GPU first, fall back to CPU if WebGPU/acceleration is unavailable.
    const build = (delegate: 'GPU' | 'CPU') =>
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: true,
      });

    try {
      return await build('GPU');
    } catch {
      return build('CPU');
    }
  })();

  // If it fails, clear the cache so the next attempt can retry.
  landmarkerPromise.catch(() => {
    landmarkerPromise = null;
  });

  return landmarkerPromise;
}

/* ── geometry helpers ─────────────────────────────────────── */
type Pt = { x: number; y: number; z: number };

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
}

function eyeAspectRatio(landmarks: Pt[], eyeIdx: number[]): number {
  const [p1, p2, p3, p4, p5, p6] = eyeIdx.map((i) => landmarks[i]);
  const vertical = (dist(p2, p6) + dist(p3, p5)) / 2;
  const horizontal = dist(p1, p4) || 1e-6;
  return vertical / horizontal;
}

/** Extract yaw/pitch (degrees) from a 4x4 transformation matrix. */
function poseFromMatrix(matrix: number[] | undefined): { yaw: number; pitch: number } {
  if (!matrix || matrix.length < 16) return { yaw: 0, pitch: 0 };
  // Row-major upper-left 3x3 rotation block.
  const r20 = matrix[8];   // row 2, col 0
  const r21 = matrix[9];   // row 2, col 1
  const r22 = matrix[10];  // row 2, col 2
  const pitch = Math.atan2(r21, r22);                   // rotation about X
  const yaw = Math.atan2(-r20, Math.hypot(r21, r22));   // rotation about Y
  return { yaw: (yaw * 180) / Math.PI, pitch: (pitch * 180) / Math.PI };
}

/** Geometric fallback head pose (degrees) from landmark geometry. */
function geometricPose(landmarks: Pt[]): { yaw: number; pitch: number } {
  const leftEye = landmarks[33];
  const rightEye = landmarks[263];
  const nose = landmarks[1];
  const midX = (leftEye.x + rightEye.x) / 2;
  const midY = (leftEye.y + rightEye.y) / 2;
  const eyeW = Math.abs(rightEye.x - leftEye.x) || 1e-6;
  const faceH = Math.abs(landmarks[152].y - landmarks[10].y) || 1e-6;
  const yaw = (Math.atan2(nose.x - midX, eyeW) * 180) / Math.PI;
  const pitch = (Math.atan2(nose.y - midY, faceH) * 180) / Math.PI * 1.5;
  return { yaw, pitch };
}

/* ── hook ─────────────────────────────────────────────────── */
export function useFocusDetection(
  videoEl: HTMLVideoElement | null,
  enabled = true,
): FocusDetectionResult {
  const [state, setState] = useState<FocusDetectionResult>({
    focusScore: 0,
    isFocused: false,
    faceDetected: false,
    loading: true,
    error: null,
    ear: 0,
    yaw: 0,
    pitch: 0,
  });

  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const rafRef = useRef<number>(0);
  const lastRunRef = useRef<number>(0);
  const bufferRef = useRef<Array<{ ts: number; focused: boolean }>>([]);
  const lastFaceTsRef = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement | null>(videoEl);
  const enabledRef = useRef(enabled);

  // Keep refs in sync without re-creating the rAF loop.
  useEffect(() => {
    videoRef.current = videoEl;
  }, [videoEl]);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    let cancelled = false;

    // ── Load model ──
    getLandmarker()
      .then((lm) => {
        if (cancelled) return;
        landmarkerRef.current = lm;
        setState((s) => ({ ...s, loading: false }));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to load focus model';
        setState((s) => ({ ...s, loading: false, error: message }));
      });

    // ── Detection loop (throttled to ~5 fps) ──
    const processFrame = (now: number) => {
      const video = videoRef.current;
      const lm = landmarkerRef.current;

      if (enabledRef.current && video && lm && video.readyState >= 2 && video.videoWidth > 0) {
        if (now - lastRunRef.current >= DETECTION_INTERVAL_MS) {
          lastRunRef.current = now;
          try {
            const result = lm.detectForVideo(video, now);
            handleResult(result);
          } catch {
            // Swallow per-frame inference errors; the next frame retries.
          }
        }
      }
      rafRef.current = requestAnimationFrame(processFrame);
    };

    const handleResult = (result: FaceLandmarkerResult) => {
      const now = Date.now();
      const hasFace = result.faceLandmarks && result.faceLandmarks.length > 0;

      if (hasFace) {
        lastFaceTsRef.current = now;
        const landmarks = result.faceLandmarks[0];

        // EAR -> eyes open
        const ear =
          (eyeAspectRatio(landmarks, LEFT_EYE) +
            eyeAspectRatio(landmarks, RIGHT_EYE)) /
          2;
        const eyesOpen = ear > EAR_THRESHOLD;

        // Head pose
        const matrix = result.facialTransformationMatrixes?.[0]?.data as
          | number[]
          | undefined;
        const { yaw, pitch } = matrix?.length
          ? poseFromMatrix(matrix)
          : geometricPose(landmarks);

        const focused = eyesOpen && Math.abs(yaw) < POSE_LIMIT_DEG && Math.abs(pitch) < POSE_LIMIT_DEG;

        // Push into rolling buffer
        const buf = bufferRef.current;
        buf.push({ ts: now, focused });
        // prune older than window
        const cutoff = now - WINDOW_MS;
        const firstKeepIdx = buf.findIndex((b) => b.ts >= cutoff);
        if (firstKeepIdx > 0) buf.splice(0, firstKeepIdx);
        else if (firstKeepIdx === -1 && buf.length > 0) buf.length = 0;

        const focusScore = buf.length
          ? Math.round((buf.filter((b) => b.focused).length / buf.length) * 100)
          : 0;

        setState((s) => ({
          ...s,
          focusScore,
          isFocused: focused,
          faceDetected: true,
          ear,
          yaw,
          pitch,
        }));
      } else {
        // No face — check timeout
        const faceDetected = now - lastFaceTsRef.current < NO_FACE_TIMEOUT_MS;
        setState((s) => (s.faceDetected === faceDetected ? s : { ...s, faceDetected }));
      }
    };

    rafRef.current = requestAnimationFrame(processFrame);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      bufferRef.current = [];
    };
    // Intentionally only run once; refs keep video/enabled fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}
