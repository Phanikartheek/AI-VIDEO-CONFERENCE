/**
 * <EngagementReport meetingId />
 *
 * 1. Fetches GET /meetings/{id}/report -> [{name, score, breakdown}].
 *    Falls back to representative sample data if the API is unavailable
 *    (so the chart renders in the standalone demo).
 * 2. Renders each participant as a 3D bar (height = score, color by band)
 *    with animated growth (damp in useFrame) + floating <Text> labels.
 * 3. OrbitControls for rotating the chart.
 * 4. Below the canvas: a 2D Tailwind table with the full per-signal breakdown.
 */
import { Suspense, useCallback, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Sparkles, Text } from '@react-three/drei';
import {
  BarChart3, ArrowLeft, RefreshCw, AlertCircle, Loader2,
} from 'lucide-react';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Engagement3D from './EngagementBars3D';
import SummaryPanel from './SummaryPanel';
import { meetingsApi } from '../../lib/api';
import type { ReportRow } from '../../lib/types';

interface EngagementReportProps {
  meetingId: string;
  token?: string | null;
  onBack?: () => void;
}

const SAMPLE_ROWS: ReportRow[] = [
  { name: 'Alex Chen', score: 86, breakdown: { video: 90, mic: 78, typing: 64, chat: 50 } },
  { name: 'Sarah Kim', score: 71, breakdown: { video: 74, mic: 82, typing: 48, chat: 100 } },
  { name: 'Mike Torres', score: 58, breakdown: { video: 62, mic: 70, typing: 35, chat: 50 } },
  { name: 'Priya Patel', score: 34, breakdown: { video: 38, mic: 22, typing: 52, chat: 0 } },
  { name: 'James Liu', score: 92, breakdown: { video: 96, mic: 84, typing: 82, chat: 100 } },
  { name: 'Emma Davis', score: 65, breakdown: { video: 68, mic: 72, typing: 40, chat: 50 } },
];

function scoreColor(score: number): string {
  if (score < 40) return '#ef4444';
  if (score <= 70) return '#eab308';
  return '#22c55e';
}

function scoreVariant(score: number): 'danger' | 'warning' | 'success' {
  if (score < 40) return 'danger';
  if (score <= 70) return 'warning';
  return 'success';
}

export default function EngagementReport({ meetingId, token, onBack }: EngagementReportProps) {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [usingSample, setUsingSample] = useState(false);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      if (!token) throw new Error('no token');
      const data = await meetingsApi.report(token, meetingId);
      setRows(data.participants.length ? data.participants : SAMPLE_ROWS);
      setUsingSample(false);
      // If samples exist with no persisted rows, it's live.
      setIsLive(data.participants.length > 0);
    } catch {
      setRows(SAMPLE_ROWS);
      setUsingSample(true);
      setIsLive(false);
    } finally {
      setLoading(false);
    }
  }, [token, meetingId]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const groupAvg = rows.length
    ? Math.round(rows.reduce((s, r) => s + r.score, 0) / rows.length)
    : 0;

  return (
    <div className="min-h-screen pt-20 pb-12 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3">
              {onBack && (
                <button
                  onClick={onBack}
                  className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
                  title="Back"
                >
                  <ArrowLeft className="w-4.5 h-4.5" />
                </button>
              )}
              <h1 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-3">
                <BarChart3 className="w-7 h-7 text-indigo-400" />
                Engagement Report
              </h1>
            </div>
            <p className="text-gray-400 mt-2 ml-12 sm:ml-12">
              Per-participant engagement breakdown{usingSample ? ' · sample data' : ''}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {usingSample ? (
              <Badge variant="warning">Sample data</Badge>
            ) : isLive ? (
              <Badge variant="info">Live</Badge>
            ) : (
              <Badge variant="success">Final</Badge>
            )}
            <Button variant="secondary" size="sm" onClick={fetchReport} loading={loading}>
              {!loading && <RefreshCw className="w-4 h-4" />}
              Refresh
            </Button>
          </div>
        </div>

        {/* 3D Chart */}
        <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-gradient-to-b from-[#0a0a1a] to-[#050510] mb-6 h-[440px]">
          <Canvas
            camera={{ position: [0, 2, 8], fov: 50 }}
            dpr={[1, 1.5]}
            gl={{ antialias: true }}
          >
            <Suspense fallback={null}>
              <ambientLight intensity={0.4} color="#c7d2fe" />
              <pointLight position={[0, 8, 4]} intensity={0.8} color="#818cf8" />
              <pointLight position={[6, 3, 4]} intensity={0.3} color="#6366f1" />
              <pointLight position={[-6, 3, -4]} intensity={0.3} color="#a78bfa" />
              <color attach="background" args={['#050510']} />
              <fog attach="fog" args={['#050510', 14, 30]} />
              <Sparkles count={80} scale={12} size={1.5} speed={0.3} opacity={0.3} color="#818cf8" />
              <Engagement3D rows={rows} />
              {rows.length === 0 && (
                <Text position={[0, 0, 0]} fontSize={0.3} color="#6b7280" anchorX="center" anchorY="middle">
                  No data
                </Text>
              )}
              <OrbitControls
                enablePan={false}
                minDistance={4}
                maxDistance={14}
                maxPolarAngle={Math.PI / 2 + 0.2}
                enableDamping
                dampingFactor={0.08}
              />
            </Suspense>
          </Canvas>

          {/* Overlay: group average */}
          <div className="absolute top-4 left-4 pointer-events-none">
            <div className="px-3 py-1.5 rounded-full bg-gray-950/70 backdrop-blur-xl border border-white/10 flex items-center gap-2">
              <span className="text-xs text-gray-400">Group avg</span>
              <span className="text-sm font-bold" style={{ color: scoreColor(groupAvg) }}>
                {groupAvg}
              </span>
            </div>
          </div>

          {/* Legend */}
          <div className="absolute bottom-4 left-4 pointer-events-none flex gap-3">
            {[
              { c: '#ef4444', l: 'Low <40' },
              { c: '#eab308', l: 'Mid 40-70' },
              { c: '#22c55e', l: 'High >70' },
            ].map((x) => (
              <div key={x.l} className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-gray-950/60 backdrop-blur-md border border-white/10">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ background: x.c }} />
                <span className="text-[10px] text-gray-300">{x.l}</span>
              </div>
            ))}
          </div>

          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-950/40">
              <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
            </div>
          )}
        </div>

        {/* 2D breakdown table */}
        <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10 flex items-center gap-2">
            <h2 className="text-sm font-semibold text-white">Per-Participant Breakdown</h2>
            {usingSample && (
              <span className="flex items-center gap-1 text-[10px] text-amber-400 ml-auto">
                <AlertCircle className="w-3 h-3" /> Backend not reachable — showing samples
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Participant</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Score</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Video</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Mic</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Typing</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Chat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map((row, i) => (
                  <tr key={`${row.name}-${i}`} className="hover:bg-white/5 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white"
                          style={{ background: scoreColor(row.score) + '33', color: scoreColor(row.score) }}
                        >
                          {row.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-white">{row.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant={scoreVariant(row.score)}>{Math.round(row.score)}</Badge>
                    </td>
                    {(['video', 'mic', 'typing', 'chat'] as const).map((k) => (
                      <td key={k} className="px-5 py-3">
                        <SignalBar value={row.breakdown[k]} />
                      </td>
                    ))}
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-sm text-gray-500">
                      {loading ? 'Loading…' : 'No participants'}
                    </td>
                  </tr>
                )}
               </tbody>
            </table>
          </div>
        </div>

        {/* AI Meeting Summary */}
        <div className="mt-6">
          <SummaryPanel meetingId={meetingId} token={token} />
        </div>
      </div>
    </div>
  );
}

/** Mini progress-bar cell for a single signal value (0–100). */
function SignalBar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-2 min-w-[90px]">
      <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${v}%`, background: scoreColor(v) }}
        />
      </div>
      <span className="text-xs text-gray-400 w-7 text-right">{Math.round(v)}</span>
    </div>
  );
}
