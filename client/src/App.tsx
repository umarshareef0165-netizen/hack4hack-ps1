import { useCallback, useEffect, useState } from 'react';
import { api, getToken, setToken, type BoardTeam, type Suggestion, type Team, type User } from './lib/api';

type View = 'board' | 'my-team' | 'create' | 'suggestions';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<View>('board');
  const [board, setBoard] = useState<BoardTeam[]>([]);
  const [myTeam, setMyTeam] = useState<Team | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [scoring, setScoring] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [live, setLive] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [b, m] = await Promise.all([api.board(), api.myTeam()]);
      setBoard(b.teams);
      setMyTeam(m.team);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    }
  }, []);

  // Restore session on load.
  useEffect(() => {
    if (!getToken()) return;
    api.me().then(({ user: u }) => setUser(u)).catch(() => setToken(null));
  }, []);

  useEffect(() => {
    if (user) void refresh();
  }, [user, refresh]);

  // Live updates: one SSE stream; any team event refreshes the board and
  // "my team" panel — no refresh button needed, no polling.
  useEffect(() => {
    const token = getToken();
    if (!token || !user) return;
    const src = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
    src.onopen = () => setLive(true);
    src.onerror = () => setLive(false);
    src.onmessage = () => void refresh();
    return () => src.close();
  }, [user, refresh]);

  async function handleAuth(e: React.FormEvent<HTMLFormElement>, mode: 'login' | 'register') {
    e.preventDefault();
    setError('');
    const data = new FormData(e.currentTarget);
    try {
      const res =
        mode === 'login'
          ? await api.login({ email: String(data.get('email')), password: String(data.get('password')) })
          : await api.register({
              name: String(data.get('name')),
              email: String(data.get('email')),
              password: String(data.get('password')),
              skills: String(data.get('skills') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
              timezoneOffset: Number(data.get('timezoneOffset') ?? 0),
            });
      setToken(res.token);
      setUser(res.user);
      setMessage(mode === 'login' ? 'Welcome back!' : 'Account created — welcome!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    }
  }

  function logout() {
    setToken(null);
    setUser(null);
    setBoard([]);
    setMyTeam(null);
    setView('board');
  }

  if (!user) {
    return (
      <main>
        <h1>Hack4Hack PS1 — Race-proof team formation</h1>
        <p>10,000 participants. One atomic seat claim. Exactly one winner when 50 people race for the last seat.</p>
        {error && <p role="alert" className="error">{error}</p>}
        <section aria-labelledby="login-h">
          <h2 id="login-h">Log in</h2>
          <form onSubmit={(e) => void handleAuth(e, 'login')}>
            <label>Email <input name="email" type="email" required autoComplete="email" /></label>
            <label>Password <input name="password" type="password" required autoComplete="current-password" /></label>
            <button type="submit">Log in</button>
          </form>
        </section>
        <section aria-labelledby="register-h">
          <h2 id="register-h">Register</h2>
          <form onSubmit={(e) => void handleAuth(e, 'register')}>
            <label>Name <input name="name" required autoComplete="name" /></label>
            <label>Email <input name="email" type="email" required autoComplete="email" /></label>
            <label>Password (min 8 characters) <input name="password" type="password" required minLength={8} autoComplete="new-password" /></label>
            <label>Skills (comma-separated) <input name="skills" placeholder="react, node, mongodb" /></label>
            <label>Timezone offset from UTC (hours) <input name="timezoneOffset" type="number" min={-12} max={14} defaultValue={0} /></label>
            <button type="submit">Create account</button>
          </form>
          <p><small>Demo account (after seeding): demo@hack4hack.local / Seed1234!</small></p>
        </section>
      </main>
    );
  }

  return (
    <main>
      <header>
        <h1>Hack4Hack PS1 — Team Formation</h1>
        <p>
          Signed in as <strong>{user.name}</strong> ({user.email}) ·{' '}
          <span aria-live="polite">{live ? '● Live updates connected' : '○ Live updates reconnecting…'}</span>{' '}
          <button type="button" onClick={logout}>Log out</button>
        </p>
        <nav aria-label="Main">
          <button type="button" onClick={() => setView('board')} aria-current={view === 'board' ? 'page' : undefined}>Looking for teammates</button>
          <button type="button" onClick={() => setView('my-team')} aria-current={view === 'my-team' ? 'page' : undefined}>My team</button>
          <button type="button" onClick={() => setView('create')} aria-current={view === 'create' ? 'page' : undefined}>Create a team</button>
          <button type="button" onClick={() => setView('suggestions')} aria-current={view === 'suggestions' ? 'page' : undefined}>Suggested teammates</button>
        </nav>
      </header>
      {message && <p role="status" className="ok">{message}</p>}
      {error && <p role="alert" className="error">{error}</p>}
      {view === 'board' && <Board teams={board} user={user} onDone={refresh} setMessage={setMessage} setError={setError} />}
      {view === 'my-team' && <MyTeam team={myTeam} user={user} onDone={refresh} setMessage={setMessage} setError={setError} />}
      {view === 'create' && <CreateTeam onDone={(t) => { setMyTeam(t); setView('my-team'); void refresh(); }} setMessage={setMessage} setError={setError} />}
      {view === 'suggestions' && <SuggestionsPanel suggestions={suggestions} scoring={scoring} onLoad={async () => { const r = await api.suggestions(); setSuggestions(r.suggestions); setScoring(r.scoring); }} />}
    </main>
  );
}

// ---------------------------------------------------------------------------

function Board({ teams, user, onDone, setMessage, setError }: {
  teams: BoardTeam[]; user: User; onDone: () => void;
  setMessage: (m: string) => void; setError: (m: string) => void;
}) {
  const [code, setCode] = useState('');
  async function joinByCode(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      // One idempotency key per button press: a double-click replays the
      // same key and the server returns the stored result instead of
      // joining twice.
      await api.joinByCode(code.trim(), crypto.randomUUID());
      setMessage('Joined the team!');
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join');
    }
  }
  async function requestJoin(teamId: string) {
    setError('');
    try {
      await api.requestJoin(teamId, crypto.randomUUID());
      setMessage('Join request sent — the leader will accept or decline.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send request');
    }
  }
  return (
    <section aria-labelledby="board-h">
      <h2 id="board-h">Looking for teammates</h2>
      <form onSubmit={joinByCode}>
        <label>Join with an invite code <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="paste invite code" required /></label>
        <button type="submit" disabled={!!user.teamId}>Join team</button>
        {user.teamId && <small> Leave your current team first — one team per person.</small>}
      </form>
      {teams.length === 0 && <p>No open teams right now. Create one!</p>}
      <ul className="cards">
        {teams.map((t) => (
          <li key={t.id}>
            <h3>{t.name}</h3>
            <p>{t.description}</p>
            <p>{t.memberCount}/{t.maxSize} members · {t.openSeats} seat{t.openSeats === 1 ? '' : 's'} open</p>
            <button type="button" onClick={() => void requestJoin(t.id)} disabled={!!user.teamId || t.openSeats === 0}>
              Request to join
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MyTeam({ team, user, onDone, setMessage, setError }: {
  team: Team | null; user: User; onDone: () => void;
  setMessage: (m: string) => void; setError: (m: string) => void;
}) {
  const [requests, setRequests] = useState<{ id: string; userId: string; status: string }[]>([]);
  const [audit, setAudit] = useState<{ id: string; action: string; actorId: string | null; createdAt: string }[]>([]);
  const [inviteCode, setInviteCode] = useState('');
  const isLeader = !!team && team.leaderId === user.id;

  useEffect(() => {
    if (!team) return;
    if (isLeader) api.listRequests(team.id).then((r) => setRequests(r.requests)).catch(() => undefined);
    api.audit(team.id).then((r) => setAudit(r.audit)).catch(() => undefined);
  }, [team, isLeader]);

  if (!team) return <section><h2>My team</h2><p>You are not in a team yet — create one or join from the board.</p></section>;

  async function respond(requestId: string, decision: 'accepted' | 'declined') {
    setError('');
    try {
      await api.respondRequest(requestId, decision);
      setMessage(decision === 'accepted' ? 'Request accepted.' : 'Request declined.');
      setRequests((rs) => rs.filter((r) => r.id !== requestId));
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not respond');
    }
  }
  return (
    <section aria-labelledby="my-team-h">
      <h2 id="my-team-h">{team.name}</h2>
      <p>{team.description}</p>
      <p>{team.memberCount}/{team.maxSize} members · {isLeader ? 'You are the leader' : 'Member'}</p>
      <ul>
        {team.members.map((m) => (
          <li key={m.userId}>
            {m.userId} — joined {new Date(m.joinedAt).toLocaleString()}
            {m.userId === team.leaderId ? ' (leader)' : ''}
            {isLeader && m.userId !== user.id && (
              <button type="button" onClick={() => void api.removeMember(team.id, m.userId).then(() => { setMessage('Member removed.'); onDone(); }).catch((e: Error) => setError(e.message))}>Remove</button>
            )}
          </li>
        ))}
      </ul>
      {isLeader && (
        <>
          <button type="button" onClick={() => void api.regenerateCode(team.id).then((r) => setInviteCode(r.inviteCode)).catch((e: Error) => setError(e.message))}>
            Regenerate invite code
          </button>
          {inviteCode && <p>New invite code (show it to your teammates, then store it safely): <code>{inviteCode}</code></p>}
          <h3>Pending join requests</h3>
          {requests.length === 0 ? <p>No pending requests.</p> : (
            <ul>{requests.map((r) => (
              <li key={r.id}>{r.userId}
                <button type="button" onClick={() => void respond(r.id, 'accepted')}>Accept</button>
                <button type="button" onClick={() => void respond(r.id, 'declined')}>Decline</button>
              </li>
            ))}</ul>
          )}
        </>
      )}
      <button type="button" onClick={() => void api.leaveTeam(team.id).then((r) => { setMessage(r.deleted ? 'Team deleted — you were the last member.' : 'You left the team.'); onDone(); }).catch((e: Error) => setError(e.message))}>
        Leave team
      </button>
      <h3>Audit log</h3>
      {audit.length === 0 ? <p>No entries yet.</p> : (
        <ol>{audit.map((a) => (
          <li key={a.id}>{a.action} — {a.actorId ?? 'system'} — {new Date(a.createdAt).toLocaleString()}</li>
        ))}</ol>
      )}
    </section>
  );
}

function CreateTeam({ onDone, setMessage, setError }: {
  onDone: (t: Team) => void; setMessage: (m: string) => void; setError: (m: string) => void;
}) {
  const [inviteCode, setInviteCode] = useState('');
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const data = new FormData(e.currentTarget);
    try {
      const res = await api.createTeam(
        { name: String(data.get('name')), description: String(data.get('description') ?? ''), maxSize: Number(data.get('maxSize')) },
        crypto.randomUUID(),
      );
      setInviteCode(res.inviteCode);
      setMessage(`Team “${res.team.name}” created. Share the invite code below.`);
      onDone(res.team);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create team');
    }
  }
  return (
    <section aria-labelledby="create-h">
      <h2 id="create-h">Create a team</h2>
      <form onSubmit={submit}>
        <label>Team name <input name="name" required maxLength={80} /></label>
        <label>Description <input name="description" maxLength={1000} /></label>
        <label>Maximum team size (2–5) <input name="maxSize" type="number" min={2} max={5} defaultValue={5} required /></label>
        <button type="submit">Create team</button>
      </form>
      {inviteCode && <p>Your invite code (shown once — copy it now): <code>{inviteCode}</code></p>}
    </section>
  );
}

function SuggestionsPanel({ suggestions, scoring, onLoad }: {
  suggestions: Suggestion[]; scoring: string; onLoad: () => Promise<void>;
}) {
  return (
    <section aria-labelledby="sugg-h">
      <h2 id="sugg-h">Suggested teammates</h2>
      <p>Ranked by complementary skills and timezone overlap.</p>
      <button type="button" onClick={() => void onLoad()}>Load suggestions</button>
      {scoring && <p><small>{scoring}</small></p>}
      <ol>
        {suggestions.map((s) => (
          <li key={s.userId}>
            <strong>{s.name}</strong> — score {s.score} · {s.explanation}
            <br /><small>Skills: {s.skills.join(', ') || '—'} · UTC{s.timezoneOffset >= 0 ? `+${s.timezoneOffset}` : s.timezoneOffset}</small>
          </li>
        ))}
      </ol>
    </section>
  );
}
