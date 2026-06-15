/**
 * FocusMonitorOverlay — demonstrates useFocusDetection + useEngagementFusion.
 *
 * - Toggles local camera capture (getUserMedia) into a hidden <video>.
 * - Runs useFocusDetection on that video (EAR, head pose, rolling focus score).
 * - Runs useEngagementFusion to produce a final engagement score.
 * - Streams {user_id, engagement_score, timestamp, breakdown} to the
 *   /ws/meetings/{id}/engagement socket every 10s (when a token is provided).
 * - Shows a live 2D HUD with focus, engagement, face detection and debug signals.
 *
 * Degrades gracefully if the camera/WS is unavailable.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Eye, EyeOff, ScanFace, ScanLine, Brain, Wifi,
  Camera, CameraOff, Loader2,
} from 'lucide-react';
import { useFocusDetection } from '../../hooks/useFocusDetection';
import { useEngagementFusion } from '../../hooks/useEngagementFusion';

interface FocusMonitorOverlayProps {
  meetingId?: string;
  token?: string | null;
  userName?: string;
  onLowEngagementAlert?: (alert: any) => void;
  onDropoffAlert?: (alert: any) => void;
  onScoreUpdate?: (score: number) => void;
}

const SAMPLE_INTERVAL_MS = 10_000;

export default function FocusMonitorOverlay({
  meetingId = 'demo-meeting',
  token,
  userName = 'You',
  onLowEngagementAlert,
  onDropoffAlert,
  onScoreUpdate,
}: FocusMonitorOverlayProps) {
  const [enabled, setEnabled] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Focus detection only runs when we have a video element.
  const focus = useFocusDetection(enabled ? videoRef.current : null, enabled);
  const fusion = useEngagementFusion({
    focusScore: focus.focusScore,
    faceDetected: focus.faceDetected,
    audioTrack: null,
    chatMessages: 0,
  });

  /* ── start / stop camera ── */
  const enable = useCallback(async () => {
    setStarting(true);
    setCamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, frameRate: 15 },
        audio: false,
      });
      streamRef.current = stream;
      setEnabled(true);
      // Defer attaching until the <video> is mounted.
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch (e) {
      setCamError(e instanceof Error ? e.message : 'Camera unavailable');
    } finally {
      setStarting(false);
    }
  }, []);

  const disable = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setEnabled(false);
  }, []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  /* ── engagement WebSocket ── */
  useEffect(() => {
    if (!enabled || !token) return;
    // Skip WebSocket connections when backend is not explicitly configured
    if (!import.meta.env.VITE_API_URL) return;
    const apiBase =
      (import.meta.env.VITE_API_URL || 'http://localhost:8000/api')
        .replace('/api', '')
        .replace(/^http/, 'ws');
    const wsUrl = `${apiBase}/ws/meetings/${meetingId}/engagement?token=${encodeURIComponent(token)}`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      return;
    }
    wsRef.current = ws;
    ws.onopen = () => setWsConnected(true);
    ws.onclose = () => setWsConnected(false);
    ws.onerror = () => setWsConnected(false);
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'low_engagement_alert') {
          onLowEngagementAlert?.(data);
        } else if (data.type === 'dropoff_risk_alert') {
          onDropoffAlert?.(data);
        }
      } catch (err) {
        console.error('Failed to parse engagement WS message:', err);
      }
    };
    return () => {
      ws.close();
      wsRef.current = null;
      setWsConnected(false);
    };
  }, [enabled, token, meetingId, onLowEngagementAlert, onDropoffAlert]);

  /* ── bubble up score updates ── */
  useEffect(() => {
    if (enabled) {
      onScoreUpdate?.(fusion.engagementScore);
    } else {
      onScoreUpdate?.(0);
    }
  }, [enabled, fusion.engagementScore, onScoreUpdate]);

  /* ── stream samples every 10s ── */
  useEffect(() => {
    if (!enabled) return;
    const send = () => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(
        JSON.stringify({
          user_id: userName,
          name: userName,
          engagement_score: fusion.engagementScore,
          timestamp: Date.now() / 1000,
          breakdown: {
            video: Math.round(fusion.breakdown.video),
            mic: Math.round(fusion.breakdown.mic),
            typing: Math.round(fusion.breakdown.typing),
            chat: Math.round(fusion.breakdown.chat),
          },
        }),
      );
    };
    const id = window.setInterval(send, SAMPLE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [enabled, fusion, userName]);

  return (
    <div className="absolute top-4 left-4 z-50 w-64">
      {/* Toggle */}
      {!enabled ? (
        <button
          onClick={enable}
          disabled={starting}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-gray-950/70 backdrop-blur-xl border border-white/10 text-xs font-medium text-gray-200 hover:bg-white/10 transition-all cursor-pointer disabled:opacity-50"
        >
          {starting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Camera className="w-3.5 h-3.5 text-indigo-400" />
          )}
          {starting ? 'Starting…' : 'Enable Focus Tracking'}
        </button>
      ) : (
        <div className="rounded-xl bg-gray-950/80 backdrop-blur-xl border border-white/10 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
            <div className="flex items-center gap-1.5">
              <Brain className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-xs font-semibold text-white">Focus Monitor</span>
            </div>
            <button
              onClick={disable}
              className="text-gray-400 hover:text-red-400 transition-colors cursor-pointer"
              title="Disable"
            >
              <CameraOff className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Hidden source video */}
          <video ref={videoRef} muted playsInline className="hidden" />

          {/* Live scores */}
          <div className="p-3 space-y-2.5">
            {/* Engagement (big) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-gray-400 uppercase tracking-wide">Engagement</span>
                {token && (
                  <span className="flex items-center gap-1 text-[9px]" style={{ color: wsConnected ? '#34d399' : '#9ca3af' }}>
                    <Wifi className="w-2.5 h-2.5" />
                    {wsConnected ? 'live' : 'local'}
                  </span>
                )}
              </div>
              <div className="flex items-end gap-2">
                <span className="text-2xl font-bold text-white leading-none">
                  {fusion.engagementScore}
                </span>
                <span className="text-[10px] text-gray-500 mb-0.5">
                  {fusion.faceDetected ? 'video-driven' : 'activity-driven'}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${fusion.engagementScore}%`,
                    background:
                      fusion.engagementScore < 40 ? '#ef4444'
                        : fusion.engagementScore <= 70 ? '#eab308' : '#22c55e',
                  }}
                />
              </div>
            </div>

            {/* Breakdown grid */}
            <div className="grid grid-cols-2 gap-1.5">
              {([
                ['Video', fusion.breakdown.video],
                ['Mic', fusion.breakdown.mic],
                ['Typing', fusion.breakdown.typing],
                ['Chat', fusion.breakdown.chat],
              ] as const).map(([label, val]) => (
                <div key={label} className="flex items-center justify-between px-2 py-1 rounded-md bg-white/5">
                  <span className="text-[9px] text-gray-400">{label}</span>
                  <span className="text-[10px] font-semibold text-gray-200">{Math.round(val)}</span>
                </div>
              ))}
            </div>

            {/* Status row */}
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <StatusChip
                active={focus.faceDetected}
                iconOn={<ScanFace className="w-3 h-3" />}
                iconOff={<ScanLine className="w-3 h-3" />}
                label={focus.faceDetected ? 'Face' : 'No face'}
              />
              <StatusChip
                active={focus.isFocused}
                iconOn={<Eye className="w-3 h-3" />}
                iconOff={<EyeOff className="w-3 h-3" />}
                label={focus.isFocused ? 'Focused' : 'Distracted'}
              />
            </div>

            {/* Debug */}
            <div className="text-[9px] text-gray-500 font-mono pt-0.5">
              EAR {focus.ear.toFixed(2)} · yaw {focus.yaw.toFixed(0)}° · pitch {focus.pitch.toFixed(0)}°
              {focus.loading && ' · loading model…'}
            </div>
          </div>
        </div>
      )}

      {camError && (
        <div className="mt-1.5 px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-[10px] text-red-300">
          {camError}
        </div>
      )}
    </div>
  );
}

function StatusChip({
  active,
  iconOn,
  iconOff,
  label,
}: {
  active: boolean;
  iconOn: React.ReactNode;
  iconOff: React.ReactNode;
  label: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-medium border ${
        active
          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
          : 'bg-gray-500/10 text-gray-400 border-gray-500/20'
      }`}
    >
      {active ? iconOn : iconOff}
      {label}
    </span>
  );
}
