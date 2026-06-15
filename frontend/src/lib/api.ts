const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

interface ApiOptions {
  method?: string;
  body?: unknown;
  token?: string;
}

async function apiFetch<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, token } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `API error: ${res.status}`);
  }

  return res.json();
}

// Auth
export const authApi = {
  register: (data: { email: string; username: string; password: string }) =>
    apiFetch<{ access_token: string; user: User }>('/auth/register', { method: 'POST', body: data }),

  login: (data: { email: string; password: string }) =>
    apiFetch<{ access_token: string; user: User }>('/auth/login', { method: 'POST', body: data }),

  me: (token: string) => apiFetch<User>('/auth/me', { token }),
};

// Meetings
export const meetingsApi = {
  create: (token: string, data: { title: string }) =>
    apiFetch<Meeting>('/meetings/create', { method: 'POST', body: data, token }),

  list: (token: string) =>
    apiFetch<{ meetings: Meeting[] }>('/meetings/', { token }),

  invite: (token: string, meetingId: string, data: { user_id?: string | null; role: string }) =>
    apiFetch<InviteResponse>(`/meetings/${meetingId}/invite`, { method: 'POST', body: data, token }),

  revokePublicInvite: (token: string, meetingId: string) =>
    apiFetch<RevokePublicInviteResponse>(`/meetings/${meetingId}/revoke-public-invite`, { method: 'POST', token }),

  updateSettings: (
    token: string,
    meetingId: string,
    data: { max_participants: number | null; require_host_approval: boolean },
  ) => apiFetch<MeetingSettingsResponse>(`/meetings/${meetingId}/settings`, { method: 'POST', body: data, token }),

  waitingRoom: (token: string, meetingId: string) =>
    apiFetch<WaitingRoomListResponse>(`/meetings/${meetingId}/waiting-room`, { token }),

  approveWaitingRoom: (token: string, meetingId: string, entryId: string) =>
    apiFetch<WaitingRoomDecisionResponse>(`/meetings/${meetingId}/waiting-room/${entryId}/approve`, { method: 'POST', token }),

  rejectWaitingRoom: (token: string, meetingId: string, entryId: string) =>
    apiFetch<WaitingRoomDecisionResponse>(`/meetings/${meetingId}/waiting-room/${entryId}/reject`, { method: 'POST', token }),

  join: (token: string, data: { invite_token: string }) =>
    apiFetch<JoinResponse>('/meetings/join', { method: 'POST', body: data, token }),

  end: (token: string, meetingId: string) =>
    apiFetch<Meeting>(`/meetings/${meetingId}/end`, { method: 'POST', token }),

  report: (token: string, meetingId: string) =>
    apiFetch<MeetingReport>(`/meetings/${meetingId}/report`, { token }),

  generateSummary: (token: string, meetingId: string) =>
    apiFetch<GenerateSummaryResponse>(`/meetings/${meetingId}/generate-summary`, { method: 'POST', token }),

  getSummary: (token: string, meetingId: string) =>
    apiFetch<GenerateSummaryResponse>(`/meetings/${meetingId}/summary`, { token }),
};

// Types
export interface User {
  id: string;
  email: string;
  username: string;
  is_active: boolean;
}

export interface Meeting {
  id: string;
  title: string;
  host_id: string;
  is_active: boolean;
  created_at: string;
  ended_at: string | null;
  public_invite_token_version?: number;
  public_invite_active?: boolean;
  max_participants?: number | null;
  require_host_approval?: boolean;
}

export interface InviteResponse {
  invite_token: string;
  meeting_id: string;
  user_id: string | null;
  role: string;
  expires_in_minutes?: number | null;
  expires_at?: string | null;
  is_public: boolean;
}

export interface RevokePublicInviteResponse {
  meeting_id: string;
  public_invite_active: boolean;
  public_invite_token_version: number;
  message: string;
}

export interface JoinResponse {
  status: 'joined' | 'waiting_for_approval';
  livekit_token: string | null;
  meeting_id: string;
  room_name: string | null;
  role: string;
  waiting_room_entry_id?: string | null;
  detail?: string | null;
}

export interface MeetingSettingsResponse {
  meeting_id: string;
  max_participants: number | null;
  require_host_approval: boolean;
  public_invite_active: boolean;
  public_invite_token_version: number;
}

export interface WaitingRoomEntry {
  id: string;
  meeting_id: string;
  user_id: string;
  requested_at: string;
  status: 'pending' | 'approved' | 'rejected' | string;
  username?: string | null;
  email?: string | null;
}

export interface WaitingRoomListResponse {
  entries: WaitingRoomEntry[];
}

export interface WaitingRoomDecisionResponse {
  id: string;
  meeting_id: string;
  user_id: string;
  status: 'approved' | 'rejected' | string;
  message: string;
}

export interface ReportBreakdown {
  video: number;
  mic: number;
  typing: number;
  chat: number;
}

export interface ReportParticipant {
  name: string;
  score: number;
  breakdown: ReportBreakdown;
}

export interface MeetingReport {
  meeting_id: string;
  participants: ReportParticipant[];
}

// Summary
export interface ActionItem {
  assignee: string;
  task: string;
}

export interface MeetingSummaryResponse {
  meeting_id: string;
  summary: string;
  key_points: string[];
  action_items: ActionItem[];
  decisions: string[];
  generated_at: string | null;
}

export interface GenerateSummaryResponse {
  meeting_id: string;
  status: 'completed' | 'error' | string;
  summary: MeetingSummaryResponse | null;
  detail: string | null;
}
