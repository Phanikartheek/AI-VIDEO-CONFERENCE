import { useEffect, useMemo, useState } from 'react';
import { Globe2, Lock, Shield, Trash2, Users } from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Badge from '../ui/Badge';
import WaitingRoomList from './WaitingRoomList';
import { meetingsApi, type WaitingRoomEntry } from '../../lib/api';

interface HostSettingsPanelProps {
  meetingId: string;
  token?: string | null;
  visible?: boolean;
  initialMaxParticipants?: number | null;
  initialRequireApproval?: boolean;
  publicInviteActive?: boolean;
  demoMode?: boolean;
}

const DEMO_WAITING: WaitingRoomEntry[] = [
  {
    id: 'demo-w1',
    meeting_id: 'demo-meeting',
    user_id: 'u1',
    requested_at: new Date().toISOString(),
    status: 'pending',
    username: 'Jordan Lee',
    email: 'jordan@example.com',
  },
  {
    id: 'demo-w2',
    meeting_id: 'demo-meeting',
    user_id: 'u2',
    requested_at: new Date().toISOString(),
    status: 'pending',
    username: 'Aisha Khan',
    email: 'aisha@example.com',
  },
];

export default function HostSettingsPanel({
  meetingId,
  token,
  visible = true,
  initialMaxParticipants = null,
  initialRequireApproval = false,
  publicInviteActive = false,
  demoMode = false,
}: HostSettingsPanelProps) {
  const isDemo = demoMode || !token;
  const [maxParticipants, setMaxParticipants] = useState<string>(initialMaxParticipants ? String(initialMaxParticipants) : '');
  const [requireApproval, setRequireApproval] = useState(initialRequireApproval);
  const [publicLinkActive, setPublicLinkActive] = useState(publicInviteActive);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [demoEntries, setDemoEntries] = useState<WaitingRoomEntry[]>(DEMO_WAITING);

  useEffect(() => {
    setRequireApproval(initialRequireApproval);
  }, [initialRequireApproval]);

  useEffect(() => {
    setPublicLinkActive(publicInviteActive);
  }, [publicInviteActive]);

  const parsedMax = useMemo(() => {
    if (maxParticipants.trim() === '') return null;
    const n = Number(maxParticipants);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [maxParticipants]);

  if (!visible) return null;

  const saveSettings = async () => {
    setSaving(true);
    setMessage(null);
    try {
      if (!isDemo && token) {
        const res = await meetingsApi.updateSettings(token, meetingId, {
          max_participants: parsedMax,
          require_host_approval: requireApproval,
        });
        setPublicLinkActive(res.public_invite_active);
      }
      setMessage('Settings saved');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const revokeLink = async () => {
    setSaving(true);
    setMessage(null);
    try {
      if (!isDemo && token) {
        const res = await meetingsApi.revokePublicInvite(token, meetingId);
        setPublicLinkActive(res.public_invite_active);
        setMessage(res.message);
      } else {
        setPublicLinkActive(false);
        setMessage('Demo public link revoked');
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Failed to revoke link');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="absolute top-16 right-4 z-50 w-[360px] max-w-[calc(100vw-2rem)]">
      <Card className="p-4 bg-gray-950/80 border-white/10 backdrop-blur-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm font-semibold text-white">Host Settings</div>
            <div className="text-[11px] text-gray-500">Public link controls & waiting room</div>
          </div>
          <Badge variant={publicLinkActive ? 'success' : 'default'}>
            {publicLinkActive ? 'link active' : 'link inactive'}
          </Badge>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-start gap-3">
              <Shield className="w-4 h-4 text-indigo-400 mt-0.5" />
              <div className="flex-1">
                <div className="text-sm font-medium text-white">Require approval to join</div>
                <div className="text-[11px] text-gray-500 mt-1">Public-link guests enter the waiting room until approved.</div>
              </div>
              <button
                onClick={() => setRequireApproval((v) => !v)}
                className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${requireApproval ? 'bg-indigo-500' : 'bg-white/10'}`}
                aria-label="Toggle host approval"
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${requireApproval ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-start gap-3 mb-3">
              <Users className="w-4 h-4 text-emerald-400 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-white">Max participants</div>
                <div className="text-[11px] text-gray-500 mt-1">Optional hard cap for public-link joins.</div>
              </div>
            </div>
            <Input
              type="number"
              min={1}
              placeholder="Unlimited"
              value={maxParticipants}
              onChange={(e) => setMaxParticipants(e.target.value)}
            />
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-start gap-3 mb-3">
              <Globe2 className="w-4 h-4 text-amber-400 mt-0.5" />
              <div className="flex-1">
                <div className="text-sm font-medium text-white">Shareable public link</div>
                <div className="text-[11px] text-gray-500 mt-1">Time-limited, versioned, and revocable instantly.</div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" className="flex-1" onClick={saveSettings} loading={saving}>
                <Lock className="w-3.5 h-3.5" />
                Save Settings
              </Button>
              <Button size="sm" variant="danger" className="flex-1" onClick={revokeLink} loading={saving}>
                <Trash2 className="w-3.5 h-3.5" />
                Revoke Link
              </Button>
            </div>
          </div>

          {message && <div className="text-xs text-gray-300">{message}</div>}
        </div>
      </Card>

      {requireApproval && (
        <WaitingRoomList
          meetingId={meetingId}
          token={token}
          demoMode={isDemo}
          demoEntries={demoEntries}
          demoOnApprove={(entryId) => setDemoEntries((entries) => entries.filter((e) => e.id !== entryId))}
          demoOnReject={(entryId) => setDemoEntries((entries) => entries.filter((e) => e.id !== entryId))}
        />
      )}
    </div>
  );
}
