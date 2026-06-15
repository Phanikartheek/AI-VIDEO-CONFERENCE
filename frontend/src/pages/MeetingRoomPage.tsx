/**
 * MeetingRoomPage — immersive 3D meeting room with chat, reactions, polls.
 */
import { Suspense, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import MeetingScene, { type FloatingReactionData } from '../components/meeting/MeetingScene';
import ControlsBar from '../components/meeting/ControlsBar';
import ConnectionStatus from '../components/meeting/ConnectionStatus';
import HostSettingsPanel from '../components/meeting/HostSettingsPanel';
import ChatPanel from '../components/meeting/ChatPanel';
import PollCreator from '../components/meeting/PollCreator';
import PollWidget from '../components/meeting/PollWidget';
import FocusMonitorOverlay from '../components/meeting/FocusMonitorOverlay';
import { useLiveKitRoom } from '../hooks/useLiveKitRoom';
import { useDemoParticipants } from '../hooks/useDemoParticipants';
import { useChatSocket } from '../hooks/useChatSocket';
import type { RoomParticipant, AlertMessage, DropoffAlert } from '../lib/types';

interface MeetingRoomPageProps {
  livekitToken?: string | null;
  meetingTitle?: string;
  meetingId?: string;
  authToken?: string | null;
  isHost?: boolean;
  onLeave: () => void;
}

function LoadingOverlay() {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-950">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full bg-indigo-500/10 animate-pulse" />
          </div>
        </div>
        <p className="text-sm text-gray-400 animate-pulse">Loading 3D environment…</p>
      </div>
    </div>
  );
}

function LocalSelfView({ track }: { track: MediaStreamTrack | null }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!track || !videoRef.current) return;
    const mediaStream = new MediaStream([track]);
    videoRef.current.srcObject = mediaStream;
    videoRef.current.play().catch((err) => {
      console.warn('Local self-view video playback failed:', err);
    });
    return () => {
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [track]);

  if (!track) return null;

  return (
    <div className="absolute bottom-24 left-4 z-40 w-48 h-36 rounded-lg overflow-hidden border border-white/10 bg-gray-950/80 backdrop-blur-md shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-300">
      <video ref={videoRef} muted playsInline autoPlay className="w-full h-full object-cover scale-x-[-1]" />
      <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-black/50 backdrop-blur-md text-[10px] text-white font-medium border border-white/5">
        Self View
      </div>
    </div>
  );
}

function computeCardPosition(index: number, count: number): [number, number, number] {
  if (count <= 1) return [0, 0.2, -2.8];
  const radius = count <= 3 ? 2.8 : count <= 6 ? 3.6 : count <= 10 ? 4.8 : 3.0 + count * 0.35;
  const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
  return [Math.cos(angle) * radius, 0.2, Math.sin(angle) * radius];
}

export default function MeetingRoomPage({
  livekitToken = null, meetingTitle, meetingId = 'demo-meeting',
  authToken = null, isHost = true, onLeave,
}: MeetingRoomPageProps) {
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(true);
  const [dropoffAlerts, setDropoffAlerts] = useState<DropoffAlert[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [pollCreatorOpen, setPollCreatorOpen] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState<FloatingReactionData[]>([]);

  const [localEngagementScore, setLocalEngagementScore] = useState<number | undefined>(undefined);
  const [liveAlert, setLiveAlert] = useState<AlertMessage | null>(null);
  const liveAlertTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const liveKit = useLiveKitRoom(livekitToken, localEngagementScore);
  const demo = useDemoParticipants(localEngagementScore);
  const isLive = livekitToken !== null && livekitToken !== '';
  const source = isLive ? liveKit : demo;

  const allParticipants = useMemo(() => {
    const list: RoomParticipant[] = [];
    if (source.localParticipant) list.push(source.localParticipant);
    list.push(...source.participants);
    return list;
  }, [source.localParticipant, source.participants]);

  const chat = useChatSocket(meetingId, authToken, chatOpen);

  const currentAlert: AlertMessage | null =
    liveAlert || (
      'alerts' in source && (source as typeof demo).alerts.length > 0
        ? (source as typeof demo).alerts[0] : null
    );

  const handleLeave = useCallback(() => { source.disconnect(); onLeave(); }, [source, onLeave]);
  const handleDropoffExpire = useCallback((id: string) => {
    setDropoffAlerts(prev => prev.filter(a => a.id !== id));
  }, []);
  const handleReactionComplete = useCallback((id: string) => {
    setFloatingReactions(prev => prev.filter(r => r.id !== id));
  }, []);

  const handleLowEngagementAlert = useCallback((data: any) => {
    if (liveAlertTimeoutRef.current) clearTimeout(liveAlertTimeoutRef.current);
    setLiveAlert({
      id: `alert-${Date.now()}`,
      text: `⚠️ Low group engagement: average score is ${data.avg_score}%`,
      type: 'warning',
      timestamp: Date.now(),
    });
    liveAlertTimeoutRef.current = setTimeout(() => {
      setLiveAlert(null);
    }, 6000);
  }, []);

  const handleDropoffAlert = useCallback((data: any) => {
    if (dropoffAlerts.some(a => a.userId === data.user_id)) return;

    const idx = allParticipants.findIndex(p => p.id === data.user_id);
    const pos = idx >= 0 ? computeCardPosition(idx, allParticipants.length) : [0, 0.2, 0] as [number, number, number];

    setDropoffAlerts(prev => {
      if (prev.some(a => a.userId === data.user_id)) return prev;
      return [...prev, {
        id: `dropoff-${Date.now()}-${data.user_id}`,
        userId: data.user_id,
        userName: data.user_name,
        currentScore: data.current_score,
        trend: data.trend || 'declining',
        position: pos,
        createdAt: Date.now(),
      }];
    });
  }, [allParticipants, dropoffAlerts]);

  useEffect(() => {
    return () => {
      if (liveAlertTimeoutRef.current) clearTimeout(liveAlertTimeoutRef.current);
    };
  }, []);

  // Spawn 3D emoji when a reaction comes in via WebSocket
  useEffect(() => {
    if (chat.reactions.length === 0) return;
    const latest = chat.reactions[chat.reactions.length - 1];
    const idx = allParticipants.findIndex(p => p.id === latest.user_id || p.name === latest.sender_name);
    const pos = idx >= 0 ? computeCardPosition(idx, allParticipants.length) : [0, 0.2, 0] as [number, number, number];
    setFloatingReactions(prev => [...prev, {
      id: `react-${Date.now()}-${Math.random()}`,
      emoji: latest.emoji,
      position: pos as [number, number, number],
    }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.reactions.length]);

  // Demo drop-off simulation
  const demoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!isHost || isLive) return;
    demoTimerRef.current = setInterval(() => {
      const candidates = allParticipants.filter(p => p.engagementScore < 50 && p.role !== 'host');
      if (!candidates.length) return;
      const target = candidates[Math.floor(Math.random() * candidates.length)];
      const idx = allParticipants.findIndex(p => p.id === target.id);
      if (dropoffAlerts.some(a => a.userId === target.id)) return;
      setDropoffAlerts(prev => [...prev, {
        id: `dropoff-${Date.now()}-${target.id}`, userId: target.id, userName: target.name,
        currentScore: target.engagementScore, trend: 'declining',
        position: computeCardPosition(idx, allParticipants.length), createdAt: Date.now(),
      }]);
    }, 12000);
    return () => { if (demoTimerRef.current) clearInterval(demoTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, isLive, allParticipants.length]);

  const handleSendReaction = useCallback((emoji: string) => {
    chat.sendReaction(emoji);
  }, [chat]);

  const handleCreatePoll = useCallback((question: string, options: string[]) => {
    // In demo mode, broadcast locally; in prod this calls POST /meetings/{id}/polls
    chat.sendMessage(`📊 Poll: ${question}\n${options.map((o, i) => `${i + 1}. ${o}`).join('\n')}`);
  }, [chat]);

  return (
    <div className="fixed inset-0 bg-gray-950 overflow-hidden">
      <Canvas camera={{ position: [0, 2, 8], fov: 55, near: 0.1, far: 100 }}
        dpr={[1, 1.5]} gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false }}
        onCreated={() => { setTimeout(() => setShowLoadingOverlay(false), 800); }}>
        <Suspense fallback={null}>
          <MeetingScene participants={allParticipants} alert={currentAlert}
            dropoffAlerts={isHost ? dropoffAlerts : []} onDropoffExpire={handleDropoffExpire}
            floatingReactions={floatingReactions} onReactionComplete={handleReactionComplete} />
        </Suspense>
      </Canvas>

      {showLoadingOverlay && <LoadingOverlay />}
      <ConnectionStatus state={source.connectionState} error={source.error} />
      <LocalSelfView track={source.localVideoTrack} />

      {isHost && (
        <HostSettingsPanel meetingId={meetingId} token={authToken} visible
          publicInviteActive initialRequireApproval={!isLive}
          initialMaxParticipants={isLive ? 25 : 50} demoMode={!isLive || !authToken} />
      )}

      <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)}
        messages={chat.messages} typingUsers={chat.typingUsers} polls={chat.polls}
        onSendMessage={chat.sendMessage} onSendTyping={chat.sendTyping}
        connected={chat.connected} />

      {/* Active polls shown in chat sidebar */}
      {chatOpen && chat.polls.filter(p => p.is_active).map(poll => (
        <div key={poll.poll_id} className="fixed right-[370px] top-20 z-50 w-72">
          <PollWidget poll={poll} isHost={isHost}
            onVote={() => { /* demo: local state only */ }}
            onClose={() => { /* demo: local state only */ }} />
        </div>
      ))}

      <PollCreator open={pollCreatorOpen} onClose={() => setPollCreatorOpen(false)}
        onSubmit={handleCreatePoll} />

      <ControlsBar isMicEnabled={source.isMicEnabled} isCamEnabled={source.isCamEnabled}
        participantCount={allParticipants.length} onToggleMic={source.toggleMic}
        onToggleCam={source.toggleCam} onLeave={handleLeave} meetingTitle={meetingTitle}
        onToggleChat={() => { setChatOpen(!chatOpen); if (!chatOpen) chat.resetUnread(); }}
        chatUnread={chat.unreadCount} onSendReaction={handleSendReaction}
        isHost={isHost} onCreatePoll={() => setPollCreatorOpen(true)} />

      <FocusMonitorOverlay
        meetingId={meetingId}
        token={authToken}
        userName={source.localParticipant?.name || 'You'}
        onLowEngagementAlert={handleLowEngagementAlert}
        onDropoffAlert={handleDropoffAlert}
        onScoreUpdate={setLocalEngagementScore}
      />
    </div>
  );
}
