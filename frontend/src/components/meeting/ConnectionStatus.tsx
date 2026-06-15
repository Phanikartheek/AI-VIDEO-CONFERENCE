/**
 * ConnectionStatus — 2D overlay indicator showing LiveKit connection state.
 * Positioned top-right, shows colored dot + text + optional spinner.
 */
import { Wifi, WifiOff, Loader2, AlertTriangle } from 'lucide-react';
import type { ConnectionState } from '../../lib/types';

interface ConnectionStatusProps {
  state: ConnectionState;
  error?: string | null;
}

const stateConfig: Record<ConnectionState, {
  label: string;
  color: string;
  dotColor: string;
  Icon: React.ComponentType<{ className?: string }>;
  animate?: boolean;
}> = {
  disconnected: {
    label: 'Disconnected',
    color: 'text-gray-400',
    dotColor: 'bg-gray-400',
    Icon: WifiOff,
  },
  connecting: {
    label: 'Connecting…',
    color: 'text-amber-400',
    dotColor: 'bg-amber-400',
    Icon: Loader2,
    animate: true,
  },
  connected: {
    label: 'Connected',
    color: 'text-emerald-400',
    dotColor: 'bg-emerald-400',
    Icon: Wifi,
  },
  reconnecting: {
    label: 'Reconnecting…',
    color: 'text-amber-400',
    dotColor: 'bg-amber-400',
    Icon: Loader2,
    animate: true,
  },
  failed: {
    label: 'Connection Failed',
    color: 'text-red-400',
    dotColor: 'bg-red-400',
    Icon: AlertTriangle,
  },
};

export default function ConnectionStatus({ state, error }: ConnectionStatusProps) {
  const config = stateConfig[state];
  const { Icon } = config;

  return (
    <div className="absolute top-4 right-4 z-50 flex flex-col items-end gap-2">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-950/70 backdrop-blur-xl border border-white/10">
        <div className="relative flex items-center justify-center">
          <div className={`w-2 h-2 rounded-full ${config.dotColor}`} />
          {state === 'connected' && (
            <div className={`absolute w-2 h-2 rounded-full ${config.dotColor} animate-ping`} />
          )}
        </div>
        <Icon className={`w-3.5 h-3.5 ${config.color} ${config.animate ? 'animate-spin' : ''}`} />
        <span className={`text-xs font-medium ${config.color}`}>
          {config.label}
        </span>
      </div>
      {error && (
        <div className="max-w-xs px-3 py-2 rounded-lg bg-red-950/80 backdrop-blur-xl border border-red-500/30 text-red-200 text-xs shadow-lg">
          <p className="font-semibold text-red-400">Media/Connection Alert</p>
          <p className="mt-0.5 opacity-90">{error}</p>
        </div>
      )}
    </div>
  );
}
