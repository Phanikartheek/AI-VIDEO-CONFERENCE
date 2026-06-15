/**
 * SummaryPanel — displays (or generates) an AI meeting summary.
 *
 * Shows: summary overview, key discussion points, action items with
 * assignee checkboxes, and decisions made. Falls back to sample data
 * when the backend is unavailable.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Sparkles, FileText, ListChecks, CheckCircle2,
  CircleDot, Loader2, AlertCircle, RefreshCw,
  Lightbulb, User, Square, CheckSquare,
} from 'lucide-react';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import { meetingsApi, type MeetingSummaryResponse } from '../../lib/api';

interface SummaryPanelProps {
  meetingId: string;
  token?: string | null;
}

/* ── Sample data for the standalone demo ─────────────────── */
const SAMPLE_SUMMARY: MeetingSummaryResponse = {
  meeting_id: 'demo-meeting',
  summary:
    'The team discussed the Q3 product roadmap, focusing on the upcoming AI features for FocusMeet. Key milestones were set for the engagement analytics dashboard and the real-time transcription pipeline. The team agreed to prioritize the public invite link security hardening before the next release.',
  key_points: [
    'AI engagement scoring is ready for beta testing with select enterprise clients',
    'Whisper-based transcription pipeline needs latency optimization for meetings over 2 hours',
    'Public invite links now support expiry, revocation, and participant caps',
    'The 3D meeting room received positive feedback from early testers',
    'Security audit for JWT invite tokens is scheduled for next sprint',
  ],
  action_items: [
    { assignee: 'Alex Chen', task: 'Benchmark Whisper transcription latency on GPU vs CPU for long meetings' },
    { assignee: 'Sarah Kim', task: 'Design the post-meeting summary email template' },
    { assignee: 'Mike Torres', task: 'Implement rate limiting on the public invite join endpoint' },
    { assignee: 'Priya Patel', task: 'Write integration tests for the waiting room approval flow' },
    { assignee: 'Unassigned', task: 'Investigate WebRTC SFU alternatives to LiveKit for cost comparison' },
  ],
  decisions: [
    'Ship public invite link feature in v0.3 release with a 4-hour token expiry default',
    'Use Anthropic Claude for meeting summarization instead of OpenAI due to longer context window',
    'Require host approval by default for meetings with more than 20 participants',
  ],
  generated_at: new Date().toISOString(),
};

export default function SummaryPanel({ meetingId, token }: SummaryPanelProps) {
  const [summary, setSummary] = useState<MeetingSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usingSample, setUsingSample] = useState(false);
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const fetchSummary = async (): Promise<'completed' | 'pending' | 'not_found'> => {
    setError(null);
    try {
      if (!token) throw new Error('no token');
      const res = await meetingsApi.getSummary(token, meetingId);
      if (res.status === 'completed' && res.summary) {
        setSummary(res.summary as MeetingSummaryResponse);
        setUsingSample(false);
        setGenerating(false);
        stopPolling();
        return 'completed';
      }
      if (res.status === 'pending') {
        setGenerating(true);
        return 'pending';
      }
      return 'not_found';
    } catch {
      setSummary(SAMPLE_SUMMARY);
      setUsingSample(true);
      return 'not_found';
    }
  };

  const mountedRef = useRef(true);

  const generateSummary = async () => {
    setGenerating(true);
    setError(null);
    try {
      if (!token) throw new Error('no token');
      const res = await meetingsApi.generateSummary(token, meetingId);
      if (res.status === 'completed' && res.summary) {
        setSummary(res.summary);
        setUsingSample(false);
        setGenerating(false);
      } else if (res.status === 'pending') {
        // Start polling every 3s until the summary is ready
        stopPolling();
        pollRef.current = setInterval(async () => {
          if (!mountedRef.current) { stopPolling(); return; }
          const status = await fetchSummary();
          if (status !== 'pending') stopPolling();
        }, 3000);
      } else {
        setError(res.detail || 'Summary generation failed');
        setSummary(SAMPLE_SUMMARY);
        setUsingSample(true);
        setGenerating(false);
      }
    } catch {
      setSummary(SAMPLE_SUMMARY);
      setUsingSample(true);
      setGenerating(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    fetchSummary().finally(() => {
      if (mountedRef.current) setLoading(false);
    });
    return () => {
      mountedRef.current = false;
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId, token]);

  const toggleItem = (index: number) => {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <Card className="p-8 text-center">
        <Loader2 className="w-6 h-6 text-indigo-400 animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-400">Loading summary…</p>
      </Card>
    );
  }

  if (!summary) {
    return (
      <Card className="p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center mx-auto mb-4">
          <Sparkles className="w-8 h-8 text-indigo-400" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">No Summary Available</h3>
        <p className="text-sm text-gray-400 mb-6 max-w-md mx-auto">
          Generate an AI-powered summary of your meeting transcript using Claude.
        </p>
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400 max-w-md mx-auto">
            {error}
          </div>
        )}
        <Button onClick={generateSummary} loading={generating}>
          <Sparkles className="w-4 h-4" />
          Generate Summary
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-400" />
          <h2 className="text-lg font-semibold text-white">AI Meeting Summary</h2>
          {usingSample && <Badge variant="warning">Sample</Badge>}
        </div>
        <div className="flex items-center gap-2">
          {summary.generated_at && (
            <span className="text-[11px] text-gray-500">
              {new Date(summary.generated_at).toLocaleString()}
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={generateSummary} loading={generating}>
            {!generating && <RefreshCw className="w-3.5 h-3.5" />}
            Regenerate
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {usingSample && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          Backend not reachable — showing sample summary data
        </div>
      )}

      {/* Summary Overview */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-semibold text-white">Meeting Summary</h3>
        </div>
        <p className="text-sm text-gray-300 leading-relaxed">{summary.summary}</p>
      </Card>

      {/* Key Discussion Points */}
      {summary.key_points.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-white">Key Discussion Points</h3>
            <Badge variant="info">{summary.key_points.length}</Badge>
          </div>
          <ul className="space-y-2.5">
            {summary.key_points.map((point, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-gray-300">
                <CircleDot className="w-3.5 h-3.5 text-indigo-400 mt-0.5 flex-shrink-0" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Action Items */}
      {summary.action_items.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <ListChecks className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">Action Items</h3>
            <Badge variant="success">
              {checkedItems.size}/{summary.action_items.length}
            </Badge>
          </div>
          <ul className="space-y-2">
            {summary.action_items.map((item, i) => {
              const checked = checkedItems.has(i);
              return (
                <li key={i}>
                  <button
                    onClick={() => toggleItem(i)}
                    className={`w-full flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer text-left ${
                      checked
                        ? 'bg-emerald-500/5 border-emerald-500/20'
                        : 'bg-white/[0.02] border-white/10 hover:bg-white/5'
                    }`}
                  >
                    {checked ? (
                      <CheckSquare className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                    ) : (
                      <Square className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${checked ? 'text-gray-500 line-through' : 'text-gray-300'}`}>
                        {item.task}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <User className="w-3 h-3 text-gray-500" />
                        <span className={`text-xs ${item.assignee === 'Unassigned' ? 'text-gray-500 italic' : 'text-indigo-300'}`}>
                          {item.assignee}
                        </span>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* Decisions Made */}
      {summary.decisions.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-4 h-4 text-purple-400" />
            <h3 className="text-sm font-semibold text-white">Decisions Made</h3>
            <Badge variant="info">{summary.decisions.length}</Badge>
          </div>
          <ul className="space-y-2.5">
            {summary.decisions.map((decision, i) => (
              <li key={i} className="flex items-start gap-2.5 p-3 rounded-xl bg-purple-500/5 border border-purple-500/15">
                <CheckCircle2 className="w-3.5 h-3.5 text-purple-400 mt-0.5 flex-shrink-0" />
                <span className="text-sm text-gray-300">{decision}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
