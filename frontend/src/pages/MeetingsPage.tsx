import { useState } from 'react';
import {
  Video, Plus, Copy, Check, Clock, Users,
  Shield, ArrowRight, X, UserPlus, Key, Link2, Globe,
} from 'lucide-react';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Input from '../components/ui/Input';

interface InviteToken {
  user_id: string | null;  // null = public invite
  token: string;
  role: string;
  is_public: boolean;
}

interface Meeting {
  id: string;
  title: string;
  host_id: string;
  is_active: boolean;
  created_at: string;
  participants: { user_id: string; role: string }[];
  invite_tokens: InviteToken[];
}

interface MeetingsPageProps {
  onEnterRoom?: (title?: string, token?: string, meetingId?: string, isHost?: boolean) => void;
}

function safeBtoa(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binString = '';
  for (let i = 0; i < bytes.length; i++) {
    binString += String.fromCharCode(bytes[i]);
  }
  return btoa(binString);
}

export default function MeetingsPage({ onEnterRoom }: MeetingsPageProps) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [selectedMeeting, setSelectedMeeting] = useState<string | null>(null);
  const [inviteUserId, setInviteUserId] = useState('');
  const [inviteRole, setInviteRole] = useState('participant');
  const [inviteType, setInviteType] = useState<'public' | 'per-user'>('public');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [joinToken, setJoinToken] = useState('');
  const [showJoin, setShowJoin] = useState(false);

  const createMeeting = () => {
    const meeting: Meeting = {
      id: crypto.randomUUID(),
      title: newTitle || 'Untitled Meeting',
      host_id: 'current-user',
      is_active: true,
      created_at: new Date().toISOString(),
      participants: [{ user_id: 'current-user', role: 'host' }],
      invite_tokens: [],
    };
    setMeetings([meeting, ...meetings]);
    setNewTitle('');
    setShowCreate(false);
  };

  const generateInvite = (meetingId: string) => {
    const isPublic = inviteType === 'public';
    
    // For per-user invites, require a user ID
    if (!isPublic && !inviteUserId) return;

    const userId = isPublic ? 'public' : inviteUserId;
    const token = `eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.${safeBtoa(JSON.stringify({
      type: 'invite',
      meeting_id: meetingId,
      user_id: userId,
      role: inviteRole,
      is_public: isPublic,
      token_version: isPublic ? 1 : undefined,
      exp: Math.floor(Date.now() / 1000) + (isPublic ? 4 * 60 * 60 : 15 * 60),
    }))}.mock_signature`;

    const newInvite: InviteToken = {
      user_id: isPublic ? null : inviteUserId,
      token,
      role: inviteRole,
      is_public: isPublic,
    };

    setMeetings(meetings.map(m =>
      m.id === meetingId
        ? { ...m, invite_tokens: [...m.invite_tokens, newInvite] }
        : m
    ));
    setInviteUserId('');
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(id);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  return (
    <div className="min-h-screen pt-20 pb-12 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Meetings</h1>
            <p className="text-gray-400 mt-1">Create, invite, and manage your meetings</p>
          </div>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={() => onEnterRoom?.('FocusMeet Demo', undefined, 'demo-meeting', true)}>
              <Video className="w-4 h-4" />
              3D Demo
            </Button>
            <Button variant="secondary" onClick={() => setShowJoin(true)}>
              <Key className="w-4 h-4" />
              Join with Token
            </Button>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4" />
              New Meeting
            </Button>
          </div>
        </div>

        {/* Create Meeting Modal */}
        {showCreate && (
          <Card className="p-6 mb-6 border-indigo-500/30">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Video className="w-5 h-5 text-indigo-400" />
                Create Meeting
              </h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex gap-3">
              <Input
                placeholder="Meeting title..."
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="flex-1"
              />
              <Button onClick={createMeeting}>
                Create
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Simulates <code className="text-indigo-400">POST /api/meetings/create</code> — in production this calls the FastAPI backend
            </p>
          </Card>
        )}

        {/* Join with Token Modal */}
        {showJoin && (
          <Card className="p-6 mb-6 border-emerald-500/30">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Key className="w-5 h-5 text-emerald-400" />
                Join Meeting
              </h2>
              <button onClick={() => setShowJoin(false)} className="text-gray-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex gap-3">
              <Input
                placeholder="Paste your invite token..."
                value={joinToken}
                onChange={(e) => setJoinToken(e.target.value)}
                className="flex-1 font-mono text-xs"
              />
              <Button variant="secondary" onClick={() => { onEnterRoom?.('Meeting Room', joinToken || undefined, 'demo-meeting', false); setJoinToken(''); setShowJoin(false); }}>
                Join
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Simulates <code className="text-indigo-400">POST /api/meetings/join</code> — validates JWT + session user match (or public token)
            </p>
          </Card>
        )}

        {/* Meetings List */}
        {meetings.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4">
              <Video className="w-10 h-10 text-gray-600" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">No meetings yet</h3>
            <p className="text-sm text-gray-400 mb-6 max-w-md mx-auto">
              Create your first meeting to start the zero-link invite flow.
              Each meeting gets a unique ID and only invited users can join.
            </p>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4" />
              Create First Meeting
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            {meetings.map((meeting) => (
              <Card key={meeting.id} className="overflow-hidden">
                {/* Meeting Header */}
                <div className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Video className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-white">{meeting.title}</h3>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(meeting.created_at).toLocaleString()}
                        </span>
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {meeting.participants.length} participant(s)
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={meeting.is_active ? 'success' : 'default'}>
                      {meeting.is_active ? 'Active' : 'Ended'}
                    </Badge>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setSelectedMeeting(selectedMeeting === meeting.id ? null : meeting.id)}
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      Invite
                    </Button>
                  </div>
                </div>

                {/* Meeting ID */}
                <div className="px-5 pb-3">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-900/50 border border-white/5 w-fit">
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">ID</span>
                    <code className="text-xs text-indigo-300 font-mono">{meeting.id}</code>
                    <button
                      onClick={() => copyToClipboard(meeting.id, `id-${meeting.id}`)}
                      className="text-gray-500 hover:text-white transition-colors cursor-pointer"
                    >
                      {copiedToken === `id-${meeting.id}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                </div>

                {/* Invite Section */}
                {selectedMeeting === meeting.id && (
                  <div className="border-t border-white/5 p-5 bg-white/[0.02]">
                    <h4 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                      <Shield className="w-4 h-4 text-amber-400" />
                      Generate Invite Token
                    </h4>

                    {/* Invite Type Selector */}
                    <div className="flex gap-2 mb-4">
                      <button
                        onClick={() => setInviteType('public')}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-all cursor-pointer ${
                          inviteType === 'public'
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                            : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                        }`}
                      >
                        <Globe className="w-4 h-4" />
                        <div className="text-left">
                          <div className="text-sm font-medium">Public Link</div>
                          <div className="text-[10px] opacity-70">Share with 25+ people</div>
                        </div>
                      </button>
                      <button
                        onClick={() => setInviteType('per-user')}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-all cursor-pointer ${
                          inviteType === 'per-user'
                            ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
                            : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                        }`}
                      >
                        <UserPlus className="w-4 h-4" />
                        <div className="text-left">
                          <div className="text-sm font-medium">Per-User</div>
                          <div className="text-[10px] opacity-70">Specific user only</div>
                        </div>
                      </button>
                    </div>

                    {/* Invite Form */}
                    <div className="flex flex-col sm:flex-row gap-3">
                      {inviteType === 'per-user' && (
                        <Input
                          placeholder="User ID (UUID)"
                          value={inviteUserId}
                          onChange={(e) => setInviteUserId(e.target.value)}
                          className="flex-1 font-mono text-xs"
                        />
                      )}
                      <select
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value)}
                        className="rounded-xl bg-white/5 border border-white/10 text-white text-sm px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer"
                      >
                        <option value="participant">Participant</option>
                        <option value="co_host">Co-Host</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      <Button onClick={() => generateInvite(meeting.id)} size="sm">
                        {inviteType === 'public' ? (
                          <>
                            <Link2 className="w-3.5 h-3.5" />
                            Generate Public Link
                          </>
                        ) : (
                          'Generate'
                        )}
                      </Button>
                    </div>

                    <p className="text-xs text-gray-500 mt-3">
                      {inviteType === 'public' ? (
                        <>
                          <span className="text-emerald-400">✓ Public invite:</span> One shareable token for large sessions,
                          but still host-controlled: 4-hour expiry, instant revoke, optional participant cap,
                          and optional host approval.
                        </>
                      ) : (
                        <>
                          <span className="text-indigo-400">🔒 Per-user invite:</span> Only the specified user can join with this token.
                        </>
                      )}
                    </p>

                    {/* Generated Tokens */}
                    {meeting.invite_tokens.length > 0 && (
                      <div className="mt-5 space-y-2">
                        <h5 className="text-xs font-medium text-gray-400 uppercase tracking-wider">Generated Tokens</h5>
                        {meeting.invite_tokens.map((inv, i) => (
                          <div key={i} className="flex items-center gap-2 p-3 rounded-lg bg-gray-900/50 border border-white/5">
                            {inv.is_public ? (
                              <Badge variant="success" className="flex items-center gap-1">
                                <Globe className="w-2.5 h-2.5" />
                                public
                              </Badge>
                            ) : (
                              <Badge variant="info" className="flex items-center gap-1">
                                <UserPlus className="w-2.5 h-2.5" />
                                per-user
                              </Badge>
                            )}
                            <Badge variant={inv.role === 'co_host' ? 'warning' : inv.role === 'viewer' ? 'default' : 'info'}>
                              {inv.role}
                            </Badge>
                            <code className="text-[10px] text-gray-400 font-mono truncate flex-1">
                              {inv.token.substring(0, 50)}...
                            </code>
                            <button
                              onClick={() => copyToClipboard(inv.token, `token-${meeting.id}-${i}`)}
                              className="text-gray-500 hover:text-white transition-colors flex-shrink-0 cursor-pointer"
                            >
                              {copiedToken === `token-${meeting.id}-${i}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
