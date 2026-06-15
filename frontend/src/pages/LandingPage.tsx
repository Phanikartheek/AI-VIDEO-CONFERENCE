import {
  Shield, Zap, Brain, Users, Lock, Globe,
  ArrowRight, Video, Mic, MonitorUp, Sparkles,
  Database, Server, ChevronRight,
} from 'lucide-react';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Scene3D from '../components/three/Scene3D';

interface LandingPageProps {
  onNavigate: (page: string) => void;
  onEnterRoom?: (title?: string, token?: string, meetingId?: string, isHost?: boolean) => void;
}

const features = [
  {
    icon: Shield,
    title: 'Tiered Access Model',
    description: 'Default zero-link per-user invites for secure sessions, plus optional host-controlled public links with expiry, revocation, caps, and approval for larger meetings.',
    color: 'text-indigo-400',
    bg: 'bg-indigo-500/10',
  },
  {
    icon: Brain,
    title: 'AI-Powered',
    description: 'Real-time transcription, meeting summarization, sentiment analysis, and action item extraction.',
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
  },
  {
    icon: Zap,
    title: 'LiveKit Integration',
    description: 'WebRTC-based video conferencing with low-latency, high-quality streams via LiveKit.',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
  },
  {
    icon: Lock,
    title: 'Role-Based Access',
    description: 'Host, co-host, participant, and viewer roles embedded directly in invite tokens.',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
  },
  {
    icon: Users,
    title: 'Session Validation',
    description: 'Double verification: invite JWT must match the authenticated session user.',
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
  },
  {
    icon: Globe,
    title: 'Full-Stack Monorepo',
    description: 'React + Three.js frontend, FastAPI backend, PostgreSQL, Redis — all orchestrated via Docker.',
    color: 'text-rose-400',
    bg: 'bg-rose-500/10',
  },
];

const techStack = [
  { label: 'React 19', sub: 'Frontend Framework' },
  { label: 'Three.js', sub: 'R3F + Drei' },
  { label: 'TypeScript', sub: 'Type Safety' },
  { label: 'Tailwind CSS', sub: 'Styling' },
  { label: 'FastAPI', sub: 'Backend API' },
  { label: 'SQLAlchemy', sub: 'ORM' },
  { label: 'PostgreSQL', sub: 'Database' },
  { label: 'Redis', sub: 'Cache / Pub-Sub' },
  { label: 'PyJWT', sub: 'Token Auth' },
  { label: 'LiveKit', sub: 'WebRTC' },
  { label: 'Docker', sub: 'Containers' },
  { label: 'Pydantic', sub: 'Validation' },
];

const apiEndpoints = [
  { method: 'POST', path: '/auth/register', desc: 'Register a new user' },
  { method: 'POST', path: '/auth/login', desc: 'Login, receive access token' },
  { method: 'GET', path: '/auth/me', desc: 'Get current user profile' },
  { method: 'POST', path: '/meetings/create', desc: 'Create meeting (host only)' },
  { method: 'POST', path: '/meetings/{id}/invite', desc: 'Generate invite JWT' },
  { method: 'POST', path: '/meetings/join', desc: 'Join with invite token' },
  { method: 'GET', path: '/meetings/', desc: 'List user\'s meetings' },
];

export default function LandingPage({ onNavigate, onEnterRoom }: LandingPageProps) {
  return (
    <div className="relative min-h-screen">
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <Scene3D />

        {/* Gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-b from-gray-950/40 via-gray-950/60 to-gray-950 pointer-events-none" />

        <div className="relative z-10 max-w-5xl mx-auto px-4 text-center pt-20">
          <Badge variant="info" className="mb-6">
            <Sparkles className="w-3 h-3 mr-1" />
            AI-Powered Video Conferencing
          </Badge>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-white tracking-tight leading-[1.1] mb-6">
            Meetings that
            <br />
            <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              stay focused
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Enterprise-grade video conferencing with a tiered access model:
            secure zero-link per-user invites by default, plus optional shareable links
            with expiry, revocation, caps, and host approval for large sessions.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" onClick={() => onEnterRoom?.('FocusMeet Demo')}>
              Try 3D Room Demo
              <ArrowRight className="w-5 h-5" />
            </Button>
            <Button variant="secondary" size="lg" onClick={() => onNavigate('register')}>
              Start Building
              <ArrowRight className="w-5 h-5" />
            </Button>
          </div>

          {/* Feature pills */}
          <div className="flex flex-wrap items-center justify-center gap-3 mt-12">
            {[
              { icon: Video, label: 'HD Video' },
              { icon: Mic, label: 'AI Transcription' },
              { icon: MonitorUp, label: 'Screen Share' },
              { icon: Lock, label: 'E2E Security' },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm text-gray-300"
              >
                <Icon className="w-4 h-4 text-indigo-400" />
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <div className="w-6 h-10 rounded-full border-2 border-white/20 flex items-start justify-center pt-2">
            <div className="w-1 h-2 rounded-full bg-white/40 animate-pulse" />
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <Badge variant="info" className="mb-4">Features</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Built for Security & Intelligence
            </h2>
            <p className="text-gray-400 max-w-2xl mx-auto">
              Every meeting is protected by per-user invite tokens. Every conversation is enhanced by AI.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <Card key={feature.title} hover className="p-6 group">
                <div className={`w-12 h-12 rounded-xl ${feature.bg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                  <feature.icon className={`w-6 h-6 ${feature.color}`} />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{feature.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Architecture Section */}
      <section id="architecture" className="py-24 px-4 border-t border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <Badge variant="info" className="mb-4">Architecture</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Zero-Link Invite Flow
            </h2>
            <p className="text-gray-400 max-w-2xl mx-auto">
              No meeting is reachable without a valid, per-user invite JWT. Here's how it works:
            </p>
          </div>

          {/* Flow Diagram */}
          <div className="max-w-4xl mx-auto mb-20">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                {
                  step: '01',
                  title: 'Create Meeting',
                  desc: 'Host authenticates and creates a meeting. Server returns a meeting_id.',
                  endpoint: 'POST /meetings/create',
                  icon: Video,
                },
                {
                  step: '02',
                  title: 'Generate Invite',
                  desc: 'Host generates a short-lived JWT scoped to a specific user_id + role.',
                  endpoint: 'POST /meetings/{id}/invite',
                  icon: Lock,
                },
                {
                  step: '03',
                  title: 'Join Meeting',
                  desc: 'Invitee submits token. Server validates JWT + session match, returns LiveKit token.',
                  endpoint: 'POST /meetings/join',
                  icon: Users,
                },
              ].map((step, i) => (
                <div key={step.step} className="relative">
                  <Card className="p-6 h-full">
                    <div className="text-3xl font-bold text-indigo-500/30 mb-3">{step.step}</div>
                    <step.icon className="w-8 h-8 text-indigo-400 mb-3" />
                    <h3 className="text-lg font-semibold text-white mb-2">{step.title}</h3>
                    <p className="text-sm text-gray-400 mb-3">{step.desc}</p>
                    <code className="text-xs text-indigo-300 bg-indigo-500/10 px-2 py-1 rounded-md font-mono">
                      {step.endpoint}
                    </code>
                  </Card>
                  {i < 2 && (
                    <div className="hidden md:flex absolute top-1/2 -right-4 z-10 -translate-y-1/2">
                      <ChevronRight className="w-8 h-8 text-indigo-500/40" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* API Endpoints Table */}
          <div className="max-w-4xl mx-auto">
            <h3 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
              <Server className="w-5 h-5 text-indigo-400" />
              API Endpoints
            </h3>
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Method</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Endpoint</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {apiEndpoints.map((ep) => (
                      <tr key={ep.path} className="hover:bg-white/5 transition-colors">
                        <td className="px-6 py-3">
                          <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded ${
                            ep.method === 'GET' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                          }`}>
                            {ep.method}
                          </span>
                        </td>
                        <td className="px-6 py-3 font-mono text-sm text-indigo-300">{ep.path}</td>
                        <td className="px-6 py-3 text-sm text-gray-400">{ep.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Tech Stack */}
      <section className="py-24 px-4 border-t border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <Badge variant="info" className="mb-4">Technology</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Full-Stack Tech</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {techStack.map((tech) => (
              <Card key={tech.label} hover className="p-4 text-center">
                <div className="text-sm font-semibold text-white">{tech.label}</div>
                <div className="text-xs text-gray-500 mt-1">{tech.sub}</div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-4 border-t border-white/5">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Ready to build?
          </h2>
          <p className="text-gray-400 mb-8">
            Explore the API, check the architecture, or dive into the codebase.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" onClick={() => onNavigate('register')}>
              Create Account
              <ArrowRight className="w-5 h-5" />
            </Button>
            <Button variant="secondary" size="lg" onClick={() => onNavigate('api-explorer')}>
              <Database className="w-5 h-5" />
              View Database Schema
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <Video className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-semibold text-gray-400">FocusMeet</span>
          </div>
          <p className="text-xs text-gray-600">Full-stack AI video conferencing monorepo</p>
        </div>
      </footer>
    </div>
  );
}
