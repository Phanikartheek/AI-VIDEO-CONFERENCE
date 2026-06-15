import { useEffect, useState } from 'react';
import { Check, Clock3, RefreshCw, X } from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { meetingsApi, type WaitingRoomEntry } from '../../lib/api';

interface WaitingRoomListProps {
  meetingId: string;
  token?: string | null;
  demoMode?: boolean;
  demoEntries?: WaitingRoomEntry[];
  demoOnApprove?: (entryId: string) => void;
  demoOnReject?: (entryId: string) => void;
}

export default function WaitingRoomList({
  meetingId,
  token,
  demoMode = false,
  demoEntries = [],
  demoOnApprove,
  demoOnReject,
}: WaitingRoomListProps) {
  const [entries, setEntries] = useState<WaitingRoomEntry[]>(demoEntries);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDemo = demoMode || !token;

  const loadEntries = async () => {
    if (isDemo) {
      setEntries(demoEntries);
      return;
    }
    if (!token) return;

    setLoading(true);
    setError(null);
    try {
      const res = await meetingsApi.waitingRoom(token, meetingId);
      setEntries(res.entries);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load waiting room');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId, token, demoEntries.length]);

  useEffect(() => {
    if (isDemo) {
      setEntries(demoEntries);
      return;
    }
    let id: any = null;

    const startPolling = () => {
      if (!id) id = window.setInterval(loadEntries, 5000);
    };
    const stopPolling = () => {
      if (id) { window.clearInterval(id); id = null; }
    };
    const onVisChange = () => {
      if (document.hidden) stopPolling();
      else { loadEntries(); startPolling(); }
    };

    startPolling();
    document.addEventListener('visibilitychange', onVisChange);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', onVisChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId, token, isDemo]);

  const approve = async (entryId: string) => {
    if (isDemo) {
      demoOnApprove?.(entryId);
      return;
    }
    if (!token) return;
    await meetingsApi.approveWaitingRoom(token, meetingId, entryId);
    await loadEntries();
  };

  const reject = async (entryId: string) => {
    if (isDemo) {
      demoOnReject?.(entryId);
      return;
    }
    if (!token) return;
    await meetingsApi.rejectWaitingRoom(token, meetingId, entryId);
    await loadEntries();
  };

  return (
    <Card className="p-4 mt-3 bg-gray-950/70 border-white/10 backdrop-blur-xl">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-semibold text-white">Waiting Room</div>
          <div className="text-[11px] text-gray-500">Pending join requests</div>
        </div>
        <Button variant="ghost" size="sm" onClick={loadEntries} loading={loading}>
          {!loading && <RefreshCw className="w-3.5 h-3.5" />}
          Refresh
        </Button>
      </div>

      {error && <div className="text-xs text-red-400 mb-2">{error}</div>}

      {entries.length === 0 ? (
        <div className="text-xs text-gray-500 py-4 text-center">No pending requests</div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div key={entry.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-white">{entry.username || entry.email || entry.user_id}</div>
                  <div className="text-[11px] text-gray-500 mt-1">{new Date(entry.requested_at).toLocaleString()}</div>
                </div>
                <Badge variant="warning" className="flex items-center gap-1">
                  <Clock3 className="w-2.5 h-2.5" />
                  pending
                </Badge>
              </div>
              <div className="flex gap-2 mt-3">
                <Button size="sm" className="flex-1" onClick={() => approve(entry.id)}>
                  <Check className="w-3.5 h-3.5" />
                  Approve
                </Button>
                <Button size="sm" variant="danger" className="flex-1" onClick={() => reject(entry.id)}>
                  <X className="w-3.5 h-3.5" />
                  Reject
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
