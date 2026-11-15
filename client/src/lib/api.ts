// Minimal API client. The JWT lives in localStorage; every team mutation
// sends a fresh Idempotency-Key so a double-click can never double-apply.
export const API = import.meta.env.VITE_API_URL ?? '';

export function getToken(): string | null {
  return localStorage.getItem('hack4hack-token');
}
export function setToken(token: string | null): void {
  if (token) localStorage.setItem('hack4hack-token', token);
  else localStorage.removeItem('hack4hack-token');
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}

async function request<T>(path: string, options: RequestInit = {}, idempotent = false): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (idempotent) {
    // One key per logical action: crypto.randomUUID() is unique per call, so
    // a retry must reuse the SAME key — the UI therefore generates the key
    // once per button press (see useIdempotentAction in App.tsx).
    headers['Idempotency-Key'] = (options as { idempotencyKey?: string }).idempotencyKey ?? crypto.randomUUID();
  }
  const res = await fetch(`${API}${path}`, { ...options, headers });
  const body = (await res.json().catch(() => ({}))) as T | ApiErrorBody;
  if (!res.ok) {
    const msg = (body as ApiErrorBody).error?.message ?? `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return body as T;
}

export interface User {
  id: string;
  name: string;
  email: string;
  skills: string[];
  timezoneOffset: number;
  lookingForTeam: boolean;
  teamId: string | null;
}

export interface Team {
  id: string;
  name: string;
  description: string;
  leaderId: string;
  members: { userId: string; joinedAt: string }[];
  memberCount: number;
  maxSize: number;
  lookingForTeammates: boolean;
  inviteCodeExpiresAt: string;
  createdAt: string;
}

export interface BoardTeam {
  id: string;
  name: string;
  description: string;
  leaderId: string;
  memberCount: number;
  maxSize: number;
  openSeats: number;
  lookingForTeammates: boolean;
  createdAt: string;
}

export interface Suggestion {
  userId: string;
  name: string;
  skills: string[];
  timezoneOffset: number;
  score: number;
  skillComplement: number;
  timezoneOverlap: number;
  explanation: string;
}

export const api = {
  register: (body: { name: string; email: string; password: string; skills: string[]; timezoneOffset: number }) =>
    request<{ user: User; token: string }>('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    request<{ user: User; token: string }>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  me: () => request<{ user: User }>('/api/auth/me'),
  board: (page = 1) => request<{ teams: BoardTeam[]; total: number; page: number }>('/api/board?page=' + page),
  myTeam: () => request<{ team: Team | null }>('/api/teams/mine/current'),
  getTeam: (id: string) => request<{ team: Team }>('/api/teams/' + id),
  createTeam: (body: { name: string; description: string; maxSize: number }, key: string) =>
    request<{ team: Team; inviteCode: string }>('/api/teams', { method: 'POST', body: JSON.stringify(body), idempotencyKey: key } as RequestInit & { idempotencyKey: string }, true),
  joinByCode: (inviteCode: string, key: string) =>
    request<{ team: Team }>('/api/teams/join-by-code', { method: 'POST', body: JSON.stringify({ inviteCode }), idempotencyKey: key } as RequestInit & { idempotencyKey: string }, true),
  requestJoin: (teamId: string, key: string) =>
    request<{ request: { id: string; status: string } }>(`/api/teams/${teamId}/requests`, { method: 'POST', body: JSON.stringify({}), idempotencyKey: key } as RequestInit & { idempotencyKey: string }, true),
  listRequests: (teamId: string) =>
    request<{ requests: { id: string; userId: string; status: string; createdAt: string }[] }>(`/api/teams/${teamId}/requests`),
  respondRequest: (requestId: string, decision: 'accepted' | 'declined') =>
    request<{ request: { id: string; status: string } }>(`/api/teams/requests/${requestId}/respond`, { method: 'POST', body: JSON.stringify({ decision }) }),
  leaveTeam: (teamId: string) =>
    request<{ deleted: boolean; team: Team | null }>(`/api/teams/${teamId}/leave`, { method: 'POST', body: JSON.stringify({}) }),
  removeMember: (teamId: string, memberId: string) =>
    request<{ team: Team }>(`/api/teams/${teamId}/members/${memberId}/remove`, { method: 'POST', body: JSON.stringify({}) }),
  regenerateCode: (teamId: string) =>
    request<{ team: Team; inviteCode: string }>(`/api/teams/${teamId}/invite-code/regenerate`, { method: 'POST', body: JSON.stringify({}) }),
  audit: (teamId: string) =>
    request<{ audit: { id: string; action: string; actorId: string | null; details: unknown; createdAt: string }[] }>(`/api/teams/${teamId}/audit`),
  suggestions: () => request<{ suggestions: Suggestion[]; scoring: string }>('/api/suggestions'),
};
