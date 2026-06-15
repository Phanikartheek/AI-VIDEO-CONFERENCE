// Dashboard page
import {
  Video, Plus, Users, Clock, Shield, Activity,
  ArrowUpRight, Calendar, Zap, Brain, TrendingUp,
} from 'lucide-react';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import type { User } from '../lib/api';

interface DashboardPageProps {
  user: User;
  onNavigate: (page: string) => void;
  onEnterRoom?: (title?: string, token?: string, meetingId?: string, isHost?: boolean) => void;
}

export default function DashboardPage({ user, onNavigate, onEnterRoom }: DashboardPageProps) {
  const stats = [
    { label: 'Total Meetings', value: '0', icon: Video, change: '+0%', color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
    { label: 'Participants', value: '0', icon: Users, change: '+0%', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: 'Hours Logged', value: '0', icon: Clock, change: '+0%', color: 'text-amber-400', bg: 'bg-amber-500/10' },
    { label: 'AI Insights', value: '0', icon: Brain, change: '+0%', color: 'text-purple-400', bg: 'bg-purple-500/10' },
  ];

  return (
    <div className="min-h-screen pt-20 pb-12 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Welcome Header */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white">
                Welcome back, <span className="text-indigo-400">{user.username}</span>
              </h1>
              <p className="text-gray-400 mt-1">Here's your meeting overview</p>
            </div>
            <Button variant="secondary" onClick={() => onEnterRoom?.('FocusMeet Demo')}>
              <Video className="w-4 h-4" />
              Enter 3D Room
            </Button>
            <Button onClick={() => onNavigate('meetings')}>
              <Plus className="w-4 h-4" />
              New Meeting
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map((stat) => (
            <Card key={stat.label} className="p-5">
              <div className="flex items-start justify-between">
                <div className={`w-10 h-10 rounded-xl ${stat.bg} flex items-center justify-center`}>
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
                <span className="text-xs text-emerald-400 flex items-center gap-0.5">
                  <TrendingUp className="w-3 h-3" />
                  {stat.change}
                </span>
              </div>
              <div className="mt-4">
                <div className="text-2xl font-bold text-white">{stat.value}</div>
                <div className="text-sm text-gray-400">{stat.label}</div>
              </div>
            </Card>
          ))}
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Quick Start */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-400" />
                Quick Start
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  onClick={() => onNavigate('meetings')}
                  className="group flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 hover:border-indigo-500/40 transition-all cursor-pointer"
                >
                  <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Video className="w-6 h-6 text-indigo-400" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-semibold text-white">Create Meeting</div>
                    <div className="text-xs text-gray-400">Start a new session</div>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-gray-500 ml-auto group-hover:text-indigo-400 transition-colors" />
                </button>

                <button
                  onClick={() => onEnterRoom?.('FocusMeet Demo')}
                  className="group flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 hover:border-purple-500/40 transition-all cursor-pointer"
                >
                  <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Video className="w-6 h-6 text-purple-400" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-semibold text-white">Enter 3D Room</div>
                    <div className="text-xs text-gray-400">Immersive meeting demo</div>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-gray-500 ml-auto group-hover:text-purple-400 transition-colors" />
                </button>
              </div>
            </Card>

            {/* Recent Meetings (empty state) */}
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-indigo-400" />
                Recent Meetings
              </h2>
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4">
                  <Video className="w-8 h-8 text-gray-600" />
                </div>
                <p className="text-gray-400 text-sm mb-4">No meetings yet</p>
                <Button size="sm" onClick={() => onNavigate('meetings')}>
                  <Plus className="w-4 h-4" />
                  Create Your First Meeting
                </Button>
              </div>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* User Profile Card */}
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg">
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">{user.username}</div>
                  <div className="text-xs text-gray-400">{user.email}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="success">Active</Badge>
                <Badge variant="info">Host</Badge>
              </div>
            </Card>

            {/* Security Status */}
            <Card className="p-6">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                Security
              </h3>
              <div className="space-y-3">
                {[
                  { label: 'JWT Authentication', status: 'Active' },
                  { label: 'Invite Token System', status: 'Enabled' },
                  { label: 'Role-Based Access', status: 'Configured' },
                  { label: 'Session Validation', status: 'Active' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">{item.label}</span>
                    <Badge variant="success" className="text-[10px]">{item.status}</Badge>
                  </div>
                ))}
              </div>
            </Card>

            {/* System Status */}
            <Card className="p-6">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4 text-amber-400" />
                System
              </h3>
              <div className="space-y-3">
                {[
                  { label: 'FastAPI Backend', status: 'Scaffold Ready' },
                  { label: 'PostgreSQL', status: 'Configured' },
                  { label: 'Redis', status: 'Configured' },
                  { label: 'LiveKit', status: 'Scaffold Ready' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">{item.label}</span>
                    <Badge variant="info" className="text-[10px]">{item.status}</Badge>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
