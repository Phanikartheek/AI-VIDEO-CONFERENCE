/**
 * useChatSocket — WebSocket hook for real-time chat, reactions, typing indicators.
 * Reconnects on drop. Returns messages, typing state, sendMessage, sendReaction, sendTyping.
 */
import { useState, useEffect, useRef, useCallback } from 'react';

/** True when VITE_API_URL is explicitly configured (backend is expected to be running). */
const hasBackend = !!import.meta.env.VITE_API_URL;

export interface ChatMsg {
  id: string;
  user_id: string | null;
  sender_name: string;
  text: string;
  timestamp: number;
}

export interface ReactionEvent {
  user_id: string;
  sender_name: string;
  emoji: string;
  timestamp: number;
}

interface UseChatSocketReturn {
  messages: ChatMsg[];
  typingUsers: string[];
  reactions: ReactionEvent[];
  polls: PollEvent[];
  connected: boolean;
  sendMessage: (text: string, senderName?: string) => void;
  sendReaction: (emoji: string, senderName?: string) => void;
  sendTyping: (senderName?: string) => void;
  unreadCount: number;
  resetUnread: () => void;
}

export interface PollEvent {
  type: 'new_poll' | 'poll_update' | 'poll_closed';
  poll_id: string;
  question: string;
  options: string[];
  vote_counts?: number[];
  total_votes?: number;
  is_active: boolean;
}

export function useChatSocket(meetingId: string, token: string | null, panelOpen: boolean): UseChatSocketReturn {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [reactions, setReactions] = useState<ReactionEvent[]>([]);
  const [polls, setPolls] = useState<PollEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectCount = useRef(0);
  const panelOpenRef = useRef(panelOpen);

  useEffect(() => { panelOpenRef.current = panelOpen; }, [panelOpen]);

  const resetUnread = useCallback(() => setUnreadCount(0), []);

  const connect = useCallback(() => {
    if (!token || !meetingId) return;
    // Skip WebSocket connections when backend is not explicitly configured
    if (!hasBackend) return;
    const base = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api')
      .replace('/api', '').replace(/^http/, 'ws');
    const ws = new WebSocket(`${base}/ws/meetings/${meetingId}/chat?token=${encodeURIComponent(token)}`);
    wsRef.current = ws;

    ws.onopen = () => { setConnected(true); reconnectCount.current = 0; };
    ws.onclose = () => {
      setConnected(false);
      // Limit reconnect attempts to avoid infinite loop
      if (reconnectCount.current < 5) {
        reconnectCount.current++;
        reconnectRef.current = setTimeout(connect, 3000);
      }
    };
    ws.onerror = () => ws.close();

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === 'history' && Array.isArray(data.messages)) {
          setMessages(data.messages);
        } else if (data.type === 'message') {
          setMessages(prev => [...prev, data]);
          if (!panelOpenRef.current) setUnreadCount(c => c + 1);
        } else if (data.type === 'typing_indicator') {
          const name = data.sender_name || data.user_id;
          setTypingUsers(prev => {
            if (prev.includes(name)) return prev;
            return [...prev, name];
          });
          setTimeout(() => {
            setTypingUsers(prev => prev.filter(n => n !== name));
          }, 3000);
        } else if (data.type === 'reaction') {
          const reactionId = data.id || `reaction-${Date.now()}-${Math.random()}`;
          setReactions(prev => [...prev, { ...data, _id: reactionId }]);
          setTimeout(() => {
            setReactions(prev => prev.filter(r => (r as any)._id !== reactionId));
          }, 3000);
        } else if (data.type === 'new_poll' || data.type === 'poll_update' || data.type === 'poll_closed') {
          setPolls(prev => {
            const idx = prev.findIndex(p => p.poll_id === data.poll_id);
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = data;
              return updated;
            }
            return [...prev, data];
          });
        }
      } catch { /* ignore */ }
    };
  }, [meetingId, token]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId, token]);

  const sendMessage = useCallback((text: string, senderName?: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'message', text, sender_name: senderName }));
  }, []);

  const sendReaction = useCallback((emoji: string, senderName?: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'reaction', emoji, sender_name: senderName }));
  }, []);

  const sendTyping = useCallback((senderName?: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'typing', sender_name: senderName }));
  }, []);

  return { messages, typingUsers, reactions, polls, connected, sendMessage, sendReaction, sendTyping, unreadCount, resetUnread };
}
