/**
 * ChatPanel — slide-out sidebar for real-time meeting chat.
 * Messages, typing indicator, emoji picker, and inline poll results.
 */
import { useState, useRef, useEffect } from 'react';
import { Send, X, Smile, BarChart3 } from 'lucide-react';
import type { ChatMsg, PollEvent } from '../../hooks/useChatSocket';

interface ChatPanelProps {
  open: boolean;
  onClose: () => void;
  messages: ChatMsg[];
  typingUsers: string[];
  polls: PollEvent[];
  onSendMessage: (text: string) => void;
  onSendTyping: () => void;
  connected: boolean;
}

const EMOJIS = ['👍', '❤️', '😂', '🎉', '🤔', '👏'];

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() / 1000) - ts);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function ChatPanel({
  open, onClose, messages, typingUsers, polls,
  onSendMessage, onSendTyping, connected,
}: ChatPanelProps) {
  const [text, setText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSent = useRef(0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = () => {
    const t = text.trim();
    if (!t) return;
    onSendMessage(t);
    setText('');
    setShowEmoji(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
      return;
    }
    // Send typing indicator immediately on first keypress, then throttle
    const now = Date.now();
    if (now - lastTypingSent.current > 2000) {
      onSendTyping();
      lastTypingSent.current = now;
    } else {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => {
        onSendTyping();
        lastTypingSent.current = Date.now();
      }, 300);
    }
  };

  const insertEmoji = (emoji: string) => {
    setText(prev => prev + emoji);
    setShowEmoji(false);
  };

  return (
    <div className={`fixed right-0 top-0 bottom-0 z-50 w-[360px] max-w-[90vw] bg-gray-950/95 backdrop-blur-xl border-l border-white/10 flex flex-col transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <h3 className="text-sm font-semibold text-white">Chat</h3>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-red-400'}`} />
          <button onClick={onClose} className="text-gray-400 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((msg) => (
          <div key={msg.id} className="group">
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-semibold text-indigo-300">{msg.sender_name || 'Unknown'}</span>
              <span className="text-[10px] text-gray-600">{timeAgo(msg.timestamp)}</span>
            </div>
            <p className="text-sm text-gray-300 mt-0.5 break-words">{msg.text}</p>
          </div>
        ))}

        {/* Closed poll results in chat */}
        {polls.filter(p => !p.is_active && p.vote_counts).map(poll => (
          <div key={poll.poll_id} className="rounded-xl bg-purple-500/10 border border-purple-500/20 p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <BarChart3 className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-xs font-semibold text-purple-300">Poll closed</span>
            </div>
            <p className="text-xs text-white font-medium mb-2">{poll.question}</p>
            {poll.options.map((opt, i) => {
              const count = poll.vote_counts?.[i] ?? 0;
              const total = poll.total_votes || 1;
              const pct = Math.round((count / total) * 100);
              return (
                <div key={i} className="mb-1">
                  <div className="flex items-center justify-between text-[10px] text-gray-400 mb-0.5">
                    <span>{opt}</span><span>{pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full rounded-full bg-purple-400" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {/* Typing indicator */}
        {typingUsers.length > 0 && (
          <div className="text-[11px] text-gray-500 italic">
            {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-3 border-t border-white/10">
        {showEmoji && (
          <div className="flex gap-1.5 mb-2 flex-wrap">
            {EMOJIS.map(e => (
              <button key={e} onClick={() => insertEmoji(e)}
                className="text-lg hover:scale-125 transition-transform cursor-pointer">{e}</button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <button onClick={() => setShowEmoji(!showEmoji)}
            className="text-gray-400 hover:text-white cursor-pointer"><Smile className="w-5 h-5" /></button>
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message…"
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
          />
          <button onClick={handleSend} disabled={!text.trim()}
            className="w-9 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center text-white disabled:opacity-30 cursor-pointer">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
