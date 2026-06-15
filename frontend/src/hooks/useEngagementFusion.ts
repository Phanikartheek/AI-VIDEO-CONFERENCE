/**
 * useEngagementFusion — combines focus, mic, typing and chat signals into a
 * single 0–100 engagement score using 30s rolling windows.
 *
 * Signals:
 *   typingScore — keydown events/min on `chatInputElement`, normalized 0–100.
 *   micScore    — Web Audio AnalyserNode on `audioTrack`; % of sampled ticks
 *                 where RMS volume > threshold (speaking), normalized 0–100.
 *   chatScore   — messages in the last 30s (1 msg = 50, 2+ = 100).
 *
 * Final score:
 *   faceDetected true  -> engagementScore = focusScore
 *   faceDetected false -> engagementScore = w_mic*micScore
 *                                    + w_typing*typingScore
 *                                    + w_chat*chatScore
 *   (weights configurable; default 0.4 / 0.3 / 0.3)
 *
 * Returns { engagementScore, breakdown, faceDetected }.
 * Cleans up listeners, intervals and the AudioContext on unmount.
 */
import { useEffect, useRef, useState } from 'react';
import type {
  EngagementBreakdown,
  EngagementFusionConfig,
  EngagementFusionResult,
} from '../lib/types';

interface UseEngagementFusionParams {
  focusScore: number;
  faceDetected: boolean;
  audioTrack?: MediaStreamTrack | null;
  chatMessages?: number;            // cumulative count of sent chat messages
  chatInputElement?: HTMLElement | null;
  config?: EngagementFusionConfig;
}

/* ── tunables ─────────────────────────────────────────────── */
const WINDOW_MS = 30_000;
const TYPING_MAX_PER_MIN = 50;      // events/min that maps to 100
const MIC_VOLUME_THRESHOLD = 0.02;  // RMS above this => speaking
const MIC_SAMPLE_MS = 100;          // sample mic every 100ms
const RECOMPUTE_MS = 1_000;         // recompute derived scores every 1s

export function useEngagementFusion({
  focusScore,
  faceDetected,
  audioTrack,
  chatMessages = 0,
  chatInputElement,
  config,
}: UseEngagementFusionParams): EngagementFusionResult {
  const wMic = config?.micWeight ?? 0.4;
  const wTyping = config?.typingWeight ?? 0.3;
  const wChat = config?.chatWeight ?? 0.3;

  const [result, setResult] = useState<EngagementFusionResult>({
    engagementScore: 0,
    breakdown: { video: 0, mic: 0, typing: 0, chat: 0 },
    faceDetected,
  });

  // Rolling buffers (timestamps)
  const typingBuf = useRef<number[]>([]);
  const micBuf = useRef<Array<{ ts: number; speaking: boolean }>>([]);
  const chatBuf = useRef<number[]>([]);
  const lastChatCount = useRef<number>(chatMessages);

  // Web Audio state
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const timeDataRef = useRef<Float32Array<ArrayBuffer> | null>(null);

  /* ── append new chat message timestamps on count increments ── */
  useEffect(() => {
    if (chatMessages > lastChatCount.current) {
      const now = Date.now();
      const added = chatMessages - lastChatCount.current;
      for (let i = 0; i < added; i++) chatBuf.current.push(now);
      lastChatCount.current = chatMessages;
    } else if (chatMessages < lastChatCount.current) {
      // Counter reset (new meeting) — resync without spamming the buffer.
      lastChatCount.current = chatMessages;
    }
  }, [chatMessages]);

  /* ── typing keydown listener ──────────────────────────────── */
  useEffect(() => {
    const el = chatInputElement;
    if (!el) return;
    const onKeyDown = () => typingBuf.current.push(Date.now());
    el.addEventListener('keydown', onKeyDown);
    return () => {
      el.removeEventListener('keydown', onKeyDown);
    };
  }, [chatInputElement]);

  /* ── mic AnalyserNode setup + sampling loop ───────────────── */
  useEffect(() => {
    if (!audioTrack) {
      // tear down any previous graph
      cleanupAudio();
      return;
    }

    let ctx: AudioContext;
    try {
      ctx = new AudioContext();
    } catch {
      return;
    }
    audioCtxRef.current = ctx;

    const stream = new MediaStream([audioTrack]);
    let source: MediaStreamAudioSourceNode;
    try {
      source = ctx.createMediaStreamSource(stream);
    } catch {
      ctx.close().catch(() => {});
      return;
    }
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    analyserRef.current = analyser;
    sourceRef.current = source;
    timeDataRef.current = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));

    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const sampleId = window.setInterval(() => {
      const data = timeDataRef.current;
      const an = analyserRef.current;
      if (!data || !an) return;
      an.getFloatTimeDomainData(data);
      let sumSq = 0;
      for (let i = 0; i < data.length; i++) sumSq += data[i] * data[i];
      const rms = Math.sqrt(sumSq / data.length);
      micBuf.current.push({ ts: Date.now(), speaking: rms > MIC_VOLUME_THRESHOLD });
    }, MIC_SAMPLE_MS);

    return () => {
      window.clearInterval(sampleId);
      cleanupAudio();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioTrack]);

  function cleanupAudio() {
    try {
      sourceRef.current?.disconnect();
      analyserRef.current?.disconnect();
    } catch {
      /* noop */
    }
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
    sourceRef.current = null;
  }

  /* ── periodic recompute of all derived scores ─────────────── */
  useEffect(() => {
    const recompute = () => {
      const now = Date.now();
      const cutoff = now - WINDOW_MS;

      // typing: events in window -> per minute -> normalized
      const typ = typingBuf.current;
      const firstKeepTyping = typ.findIndex((t) => t >= cutoff);
      if (firstKeepTyping > 0) typ.splice(0, firstKeepTyping);
      else if (firstKeepTyping === -1 && typ.length > 0) typ.length = 0;
      const eventsPerMin = (typ.length / WINDOW_MS) * 60_000;
      const typingScore = Math.min(100, Math.round((eventsPerMin / TYPING_MAX_PER_MIN) * 100));

      // mic: % speaking ticks in window
      const mic = micBuf.current;
      const firstKeepMic = mic.findIndex((m) => m.ts >= cutoff);
      if (firstKeepMic > 0) mic.splice(0, firstKeepMic);
      else if (firstKeepMic === -1 && mic.length > 0) mic.length = 0;
      const micScore = mic.length
        ? Math.round((mic.filter((m) => m.speaking).length / mic.length) * 100)
        : 0;

      // chat: messages in window
      const chat = chatBuf.current;
      const firstKeepChat = chat.findIndex((c) => c >= cutoff);
      if (firstKeepChat > 0) chat.splice(0, firstKeepChat);
      else if (firstKeepChat === -1 && chat.length > 0) chat.length = 0;
      let chatScore = 0;
      if (chat.length >= 2) chatScore = 100;
      else if (chat.length === 1) chatScore = 50;

      const breakdown: EngagementBreakdown = {
        video: focusScore,
        mic: micScore,
        typing: typingScore,
        chat: chatScore,
      };

      let engagementScore: number;
      if (faceDetected) {
        engagementScore = focusScore;
      } else {
        engagementScore = Math.round(
          wMic * micScore + wTyping * typingScore + wChat * chatScore,
        );
      }

      setResult({ engagementScore, breakdown, faceDetected });
    };

    recompute(); // initial
    const id = window.setInterval(recompute, RECOMPUTE_MS);
    return () => window.clearInterval(id);
  }, [focusScore, faceDetected, wMic, wTyping, wChat]);

  return result;
}
