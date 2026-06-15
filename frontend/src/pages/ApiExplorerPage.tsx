import { useState } from 'react';
import {
  Send, ChevronDown, ChevronRight, Copy, Check,
  Lock, Server, Database, Code2, FileJson,
} from 'lucide-react';
// Button available for future use
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';

interface Endpoint {
  method: 'GET' | 'POST';
  path: string;
  description: string;
  auth: boolean;
  body?: string;
  response: string;
  notes: string;
}

const endpoints: Endpoint[] = [
  {
    method: 'POST',
    path: '/api/auth/register',
    description: 'Register a new user account',
    auth: false,
    body: JSON.stringify({ email: 'user@example.com', username: 'johndoe', password: 'securepass123' }, null, 2),
    response: JSON.stringify({
      access_token: 'eyJhbGciOiJIUzI1NiIs...',
      token_type: 'bearer',
      user: { id: 'uuid', email: 'user@example.com', username: 'johndoe', is_active: true },
    }, null, 2),
    notes: 'Creates user with bcrypt-hashed password. Returns JWT access token (60min expiry).',
  },
  {
    method: 'POST',
    path: '/api/auth/login',
    description: 'Authenticate and receive access token',
    auth: false,
    body: JSON.stringify({ email: 'user@example.com', password: 'securepass123' }, null, 2),
    response: JSON.stringify({
      access_token: 'eyJhbGciOiJIUzI1NiIs...',
      token_type: 'bearer',
      user: { id: 'uuid', email: 'user@example.com', username: 'johndoe', is_active: true },
    }, null, 2),
    notes: 'Validates credentials against bcrypt hash. Returns JWT with {sub, email, type, exp, iat, jti}.',
  },
  {
    method: 'GET',
    path: '/api/auth/me',
    description: 'Get current authenticated user',
    auth: true,
    response: JSON.stringify({ id: 'uuid', email: 'user@example.com', username: 'johndoe', is_active: true }, null, 2),
    notes: 'Requires Bearer token in Authorization header. Validates JWT and returns user profile.',
  },
  {
    method: 'POST',
    path: '/api/meetings/create',
    description: 'Create a new meeting (host auth required)',
    auth: true,
    body: JSON.stringify({ title: 'Sprint Planning' }, null, 2),
    response: JSON.stringify({
      id: '550e8400-e29b-41d4-a716-446655440000',
      title: 'Sprint Planning',
      host_id: 'user-uuid',
      is_active: true,
      created_at: '2025-01-15T10:30:00Z',
      ended_at: null,
    }, null, 2),
    notes: 'Creates Meeting record + Participant record (host role). Returns meeting_id for invite generation.',
  },
  {
    method: 'POST',
    path: '/api/meetings/{id}/invite',
    description: 'Generate invite JWT (per-user OR public)',
    auth: true,
    body: JSON.stringify({ user_id: null, role: 'participant' }, null, 2),
    response: JSON.stringify({
      invite_token: 'eyJhbGciOiJIUzI1NiIs...',
      meeting_id: '550e8400-e29b-41d4-a716-446655440000',
      user_id: null,
      role: 'participant',
      expires_in_minutes: 15,
      is_public: true,
    }, null, 2),
    notes: 'PUBLIC INVITE: Omit user_id to generate a shareable link for 25+ people. PER-USER: Include user_id to scope token to one user. Only host can generate.',
  },
  {
    method: 'POST',
    path: '/api/meetings/join',
    description: 'Join meeting with invite token',
    auth: true,
    body: JSON.stringify({ invite_token: 'eyJhbGciOiJIUzI1NiIs...' }, null, 2),
    response: JSON.stringify({
      livekit_token: 'eyJhbGciOiJIUzI1NiIs...',
      meeting_id: '550e8400-e29b-41d4-a716-446655440000',
      room_name: 'meeting-550e8400-e29b-41d4-a716-446655440000',
      role: 'participant',
    }, null, 2),
    notes: 'For PUBLIC tokens: any authenticated user can join. For PER-USER tokens: session user must match token user_id. Creates Participant record.',
  },
  {
    method: 'GET',
    path: '/api/meetings/',
    description: 'List all meetings hosted by current user',
    auth: true,
    response: JSON.stringify({
      meetings: [
        { id: 'uuid', title: 'Sprint Planning', host_id: 'user-uuid', is_active: true, created_at: '2025-01-15T10:30:00Z', ended_at: null },
      ],
    }, null, 2),
    notes: 'Returns meetings where current user is the host, ordered by created_at descending.',
  },
];

const dbModels = [
  {
    name: 'User',
    table: 'users',
    fields: [
      { name: 'id', type: 'UUID', notes: 'Primary key, auto-generated' },
      { name: 'email', type: 'String(255)', notes: 'Unique, indexed' },
      { name: 'username', type: 'String(100)', notes: 'Unique' },
      { name: 'hashed_password', type: 'String(255)', notes: 'bcrypt hash' },
      { name: 'is_active', type: 'Boolean', notes: 'Default: true' },
      { name: 'created_at', type: 'DateTime', notes: 'Auto' },
      { name: 'updated_at', type: 'DateTime', notes: 'Auto' },
    ],
  },
  {
    name: 'Meeting',
    table: 'meetings',
    fields: [
      { name: 'id', type: 'UUID', notes: 'Primary key' },
      { name: 'title', type: 'String(255)', notes: 'Default: "Untitled Meeting"' },
      { name: 'host_id', type: 'UUID → users.id', notes: 'Foreign key' },
      { name: 'is_active', type: 'Boolean', notes: 'Default: true' },
      { name: 'ended_at', type: 'DateTime?', notes: 'Nullable' },
      { name: 'created_at', type: 'DateTime', notes: 'Auto' },
      { name: 'updated_at', type: 'DateTime', notes: 'Auto' },
    ],
  },
  {
    name: 'Participant',
    table: 'participants',
    fields: [
      { name: 'id', type: 'UUID', notes: 'Primary key' },
      { name: 'meeting_id', type: 'UUID → meetings.id', notes: 'Foreign key' },
      { name: 'user_id', type: 'UUID → users.id', notes: 'Foreign key' },
      { name: 'role', type: 'Enum', notes: 'host | co_host | participant | viewer' },
      { name: 'joined_at', type: 'DateTime', notes: 'Auto' },
    ],
  },
];

export default function ApiExplorerPage() {
  const [expandedEndpoint, setExpandedEndpoint] = useState<number | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'api' | 'models'>('api');

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(null), 2000);
  };

  return (
    <div className="min-h-screen pt-20 pb-12 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-3">
            <Code2 className="w-8 h-8 text-indigo-400" />
            API Explorer
          </h1>
          <p className="text-gray-400 mt-2">
            Interactive reference for the FocusMeet FastAPI backend. All endpoints, schemas, and database models.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 p-1 bg-white/5 rounded-xl w-fit border border-white/10">
          <button
            onClick={() => setActiveTab('api')}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
              activeTab === 'api' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Server className="w-4 h-4 inline mr-1.5" />
            Endpoints
          </button>
          <button
            onClick={() => setActiveTab('models')}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
              activeTab === 'models' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Database className="w-4 h-4 inline mr-1.5" />
            Database Models
          </button>
        </div>

        {/* API Endpoints */}
        {activeTab === 'api' && (
          <div className="space-y-3">
            {endpoints.map((ep, i) => (
              <Card key={i} className="overflow-hidden">
                <button
                  onClick={() => setExpandedEndpoint(expandedEndpoint === i ? null : i)}
                  className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <span className={`text-xs font-bold font-mono px-2.5 py-1 rounded-md flex-shrink-0 ${
                    ep.method === 'GET' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                  }`}>
                    {ep.method}
                  </span>
                  <code className="text-sm text-indigo-300 font-mono">{ep.path}</code>
                  <span className="text-xs text-gray-500 hidden sm:inline">— {ep.description}</span>
                  <div className="ml-auto flex items-center gap-2">
                    {ep.auth && (
                      <Lock className="w-3.5 h-3.5 text-amber-400" />
                    )}
                    {expandedEndpoint === i ? (
                      <ChevronDown className="w-4 h-4 text-gray-500" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-500" />
                    )}
                  </div>
                </button>

                {expandedEndpoint === i && (
                  <div className="border-t border-white/5 p-5 space-y-4 bg-white/[0.02]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={ep.auth ? 'warning' : 'success'}>
                        {ep.auth ? '🔒 Auth Required' : '🌍 Public'}
                      </Badge>
                      <Badge variant="info">{ep.method}</Badge>
                    </div>

                    <p className="text-sm text-gray-300">{ep.description}</p>

                    {/* Notes */}
                    <div className="p-3 rounded-lg bg-indigo-500/5 border border-indigo-500/10">
                      <p className="text-xs text-indigo-300">{ep.notes}</p>
                    </div>

                    {/* Request Body */}
                    {ep.body && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                            <Send className="w-3 h-3" />
                            Request Body
                          </h4>
                          <button
                            onClick={() => copyToClipboard(ep.body!, `req-${i}`)}
                            className="text-gray-500 hover:text-white transition-colors cursor-pointer"
                          >
                            {copiedText === `req-${i}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        <pre className="p-4 rounded-lg bg-gray-900/80 border border-white/5 text-xs text-gray-300 font-mono overflow-x-auto">
                          {ep.body}
                        </pre>
                      </div>
                    )}

                    {/* Response */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                          <FileJson className="w-3 h-3" />
                          Response
                        </h4>
                        <button
                          onClick={() => copyToClipboard(ep.response, `res-${i}`)}
                          className="text-gray-500 hover:text-white transition-colors cursor-pointer"
                        >
                          {copiedText === `res-${i}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      <pre className="p-4 rounded-lg bg-gray-900/80 border border-white/5 text-xs text-emerald-300/80 font-mono overflow-x-auto">
                        {ep.response}
                      </pre>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}

        {/* Database Models */}
        {activeTab === 'models' && (
          <div className="space-y-6">
            {dbModels.map((model) => (
              <Card key={model.name} className="overflow-hidden">
                <div className="p-5 border-b border-white/5">
                  <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Database className="w-5 h-5 text-indigo-400" />
                    {model.name}
                  </h3>
                  <code className="text-xs text-gray-500 font-mono mt-1 block">
                    Table: {model.table}
                  </code>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Column</th>
                        <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Type</th>
                        <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-5 py-3">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {model.fields.map((field) => (
                        <tr key={field.name} className="hover:bg-white/5 transition-colors">
                          <td className="px-5 py-2.5 font-mono text-sm text-indigo-300">{field.name}</td>
                          <td className="px-5 py-2.5 font-mono text-xs text-amber-300/80">{field.type}</td>
                          <td className="px-5 py-2.5 text-xs text-gray-400">{field.notes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ))}

            {/* Invite Token Schema */}
            <Card className="p-5">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Lock className="w-5 h-5 text-amber-400" />
                Invite JWT Schema
              </h3>
              <pre className="p-4 rounded-lg bg-gray-900/80 border border-white/5 text-xs text-gray-300 font-mono overflow-x-auto">
{`{
  "type": "invite",           // Token type discriminator
  "meeting_id": "uuid",       // Scoped to specific meeting
  "user_id": "uuid",          // Scoped to specific user
  "role": "participant",      // Role: host | co_host | participant | viewer
  "exp": 1705312200,          // Expires in 15 minutes
  "iat": 1705311300,          // Issued at
  "jti": "uuid"               // Unique token ID (for revocation)
}`}
              </pre>
              <div className="mt-4 p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
                <p className="text-xs text-amber-300">
                  <strong>Security:</strong> On join, the server validates (1) JWT signature, (2) token not expired,
                  (3) type is "invite", (4) session user matches token user_id. All four checks must pass.
                </p>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
