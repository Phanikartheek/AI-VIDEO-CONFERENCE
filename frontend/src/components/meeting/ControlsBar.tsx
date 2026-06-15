/**
 * ControlsBar — 2D Tailwind overlay at the bottom of the meeting room.
 * mic / camera / screen share / chat / reactions / polls / leave buttons.
 */
import { useState } from 'react';
import {
  Mic, MicOff, Camera, CameraOff, PhoneOff, Users, Settings,
  MonitorUp, MessageSquare, Smile, BarChart3, X,
} from 'lucide-react';
import { cn } from '@/utils/cn';

const REACTION_EMOJIS = ['👍', '❤️', '😂', '🎉', '🤔', '👏'];

interface ControlsBarProps {
  isMicEnabled: boolean;
  isCamEnabled: boolean;
  participantCount: number;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onLeave: () => void;
  meetingTitle?: string;
  onToggleChat?: () => void;
  chatUnread?: number;
  onSendReaction?: (emoji: string) => void;
  isHost?: boolean;
  onCreatePoll?: () => void;
}

function ControlButton({ active, danger, onClick, children, label, badge }: {
  active?: boolean; danger?: boolean; onClick: () => void;
  children: React.ReactNode; label: string; badge?: number;
}) {
  return (
    <button onClick={onClick} title={label}
      className={cn(
        'group relative w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-200 cursor-pointer',
        danger ? 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30'
          : active ? 'bg-white/10 hover:bg-white/20 text-white border border-white/10'
            : 'bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/20',
      )}>
      {children}
      {badge !== undefined && badge > 0 && (
        <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
      <span className="absolute -top-9 left-1/2 -translate-x-1/2 px-2 py-1 text-[10px] font-medium text-white bg-gray-900 rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none border border-white/10">
        {label}
      </span>
    </button>
  );
}

export default function ControlsBar({
  isMicEnabled, isCamEnabled, participantCount,
  onToggleMic, onToggleCam, onLeave, meetingTitle,
  onToggleChat, chatUnread = 0, onSendReaction, isHost, onCreatePoll,
}: ControlsBarProps) {
  const [showReactions, setShowReactions] = useState(false);

  return (
    <div className="absolute bottom-0 left-0 right-0 z-40 pointer-events-none">
      {/* Emoji reaction picker (floats above center controls) */}
      {showReactions && (
        <div className="flex justify-center mb-2 pointer-events-auto">
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-gray-950/80 backdrop-blur-xl border border-white/10">
            {REACTION_EMOJIS.map(e => (
              <button key={e} onClick={() => { onSendReaction?.(e); setShowReactions(false); }}
                className="text-xl hover:scale-130 transition-transform cursor-pointer p-1">{e}</button>
            ))}
            <button onClick={() => setShowReactions(false)}
              className="ml-1 text-gray-400 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      <div className="flex items-end justify-between px-4 sm:px-6 pb-6">
        {/* Left: meeting info */}
        <div className="pointer-events-auto">
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-gray-950/70 backdrop-blur-xl border border-white/10">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-emerald-400 font-medium">Live</span>
            </div>
            <div className="w-px h-4 bg-white/10" />
            <span className="text-xs text-gray-300 font-medium max-w-[140px] truncate">
              {meetingTitle || 'FocusMeet Room'}
            </span>
            <div className="w-px h-4 bg-white/10" />
            <div className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs text-gray-400">{participantCount}</span>
            </div>
          </div>
        </div>

        {/* Center: main controls */}
        <div className="pointer-events-auto">
          <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-gray-950/70 backdrop-blur-xl border border-white/10">
            <ControlButton active={isMicEnabled} onClick={onToggleMic}
              label={isMicEnabled ? 'Mute mic' : 'Unmute mic'}>
              {isMicEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
            </ControlButton>

            <ControlButton active={isCamEnabled} onClick={onToggleCam}
              label={isCamEnabled ? 'Turn off camera' : 'Turn on camera'}>
              {isCamEnabled ? <Camera className="w-5 h-5" /> : <CameraOff className="w-5 h-5" />}
            </ControlButton>

            <ControlButton active onClick={() => {}} label="Share screen (coming soon)">
              <MonitorUp className="w-5 h-5 opacity-50" />
            </ControlButton>

            <ControlButton active onClick={() => onToggleChat?.()} label="Chat" badge={chatUnread}>
              <MessageSquare className="w-5 h-5" />
            </ControlButton>

            <ControlButton active onClick={() => setShowReactions(!showReactions)} label="React">
              <Smile className="w-5 h-5" />
            </ControlButton>

            {isHost && onCreatePoll && (
              <ControlButton active onClick={onCreatePoll} label="Create poll">
                <BarChart3 className="w-5 h-5" />
              </ControlButton>
            )}

            <div className="w-px h-8 bg-white/10 mx-1" />

            <ControlButton danger onClick={onLeave} label="Leave meeting">
              <PhoneOff className="w-5 h-5" />
            </ControlButton>
          </div>
        </div>

        {/* Right: settings */}
        <div className="pointer-events-auto">
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gray-950/70 backdrop-blur-xl border border-white/10">
            <button className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-400/50 cursor-not-allowed" title="Settings (coming soon)">
              <Settings className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
