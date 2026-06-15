import { useEffect } from 'react';

/** True when VITE_API_URL is explicitly configured (backend is expected to be running). */
const hasBackend = !!import.meta.env.VITE_API_URL;

interface WaitingRoomApprovalOptions {
  meetingId: string;
  token: string | null;
  enabled?: boolean;
  onApproved: (payload: { livekit_token: string; meeting_id: string; room_name: string; role: string }) => void;
  onRejected?: (payload: { reason?: string }) => void;
}

/**
 * Opens /ws/meetings/{meeting_id}/waiting-room and listens for host decisions.
 * When approved, the caller can auto-redirect into the LiveKit room.
 */
export function useWaitingRoomApproval({
  meetingId,
  token,
  enabled = true,
  onApproved,
  onRejected,
}: WaitingRoomApprovalOptions) {
  useEffect(() => {
    if (!enabled || !token || !meetingId) return;
    // Skip WebSocket connections when backend is not explicitly configured
    if (!hasBackend) return;

    const base = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api')
      .replace('/api', '')
      .replace(/^http/, 'ws');
    const ws = new WebSocket(`${base}/ws/meetings/${meetingId}/waiting-room?token=${encodeURIComponent(token)}`);

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'join_approved' && payload.livekit_token) {
          onApproved(payload);
        } else if (payload.type === 'join_rejected') {
          onRejected?.(payload);
        }
      } catch {
        // ignore malformed messages
      }
    };

    return () => {
      ws.close();
    };
  }, [meetingId, token, enabled, onApproved, onRejected]);
}
