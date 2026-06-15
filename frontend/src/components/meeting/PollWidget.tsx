/**
 * PollWidget — inline poll in the chat sidebar.
 * Shows question, option buttons, live results bar chart.
 * Host sees "Close Poll" button.
 */
import { useState } from 'react';
import { BarChart3, Check, X } from 'lucide-react';
import type { PollEvent } from '../../hooks/useChatSocket';
// Button available for future use

interface PollWidgetProps {
  poll: PollEvent;
  isHost: boolean;
  onVote: (pollId: string, optionIndex: number) => void;
  onClose: (pollId: string) => void;
}

export default function PollWidget({ poll, isHost, onVote, onClose }: PollWidgetProps) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const hasVoted = selectedIdx !== null;
  const total = poll.total_votes || 0;

  const handleVote = (idx: number) => {
    setSelectedIdx(idx);
    onVote(poll.poll_id, idx);
  };

  return (
    <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/20 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <BarChart3 className="w-4 h-4 text-indigo-400" />
          <span className="text-xs font-semibold text-indigo-300">
            {poll.is_active ? 'Live Poll' : 'Poll Closed'}
          </span>
        </div>
        {isHost && poll.is_active && (
          <button onClick={() => onClose(poll.poll_id)}
            className="text-gray-400 hover:text-red-400 cursor-pointer"><X className="w-4 h-4" /></button>
        )}
      </div>

      <p className="text-sm font-medium text-white mb-3">{poll.question}</p>

      <div className="space-y-2">
        {poll.options.map((opt, i) => {
          const count = poll.vote_counts?.[i] ?? 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const isSelected = selectedIdx === i;
          const showResults = hasVoted || !poll.is_active;

          return (
            <button
              key={i}
              disabled={!poll.is_active || hasVoted}
              onClick={() => handleVote(i)}
              className={`w-full text-left rounded-lg border p-2.5 transition-all cursor-pointer ${
                isSelected
                  ? 'border-indigo-500/50 bg-indigo-500/15'
                  : 'border-white/10 bg-white/5 hover:bg-white/10'
              } ${!poll.is_active || hasVoted ? 'cursor-default' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isSelected && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                  <span className="text-xs text-gray-300">{opt}</span>
                </div>
                {showResults && <span className="text-[10px] text-gray-500">{pct}%</span>}
              </div>
              {showResults && (
                <div className="mt-1.5 h-1 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full rounded-full bg-indigo-400 transition-all" style={{ width: `${pct}%` }} />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {total > 0 && <p className="text-[10px] text-gray-500 mt-2">{total} vote{total !== 1 ? 's' : ''}</p>}
    </div>
  );
}
