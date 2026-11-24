import { useEffect, useState } from 'react';
import type { Choice, PlayerView } from '../../shared/types';
import { api, ApiError } from '../lib/api';
import { syncClock } from '../lib/clock';
import { usePoll } from '../lib/poll';
import { load, save } from '../lib/storage';
import { Eliminated } from './Eliminated';
import { Lobby } from './Lobby';
import { Profile } from './Profile';
import { QuestionScreen } from './QuestionScreen';
import { Standings } from './Standings';
import { Survived } from './Survived';
import { Winner } from './Winner';

const ID_KEY = 'minvoice.playerId';
const POLL_MS = 1000;

function fetchState() {
  const id = load(ID_KEY);
  return api<PlayerView>('GET', `/api/state${id ? `?id=${encodeURIComponent(id)}` : ''}`);
}

export function PlayerApp() {
  const [view, setView] = useState<PlayerView | null>(null);
  const [connected, setConnected] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showStandings, setShowStandings] = useState(false);

  const refresh = usePoll(
    fetchState,
    (v) => {
      syncClock(v.serverNow);
      setView(v);
      setConnected(true);
    },
    () => setConnected(false),
    POLL_MS,
  );

  // Leave the standings overlay when the game moves on.
  useEffect(() => {
    if (view?.phase !== 'result') setShowStandings(false);
  }, [view?.phase]);

  if (!view) {
    return (
      <div className="phone">
        <p className="lede">{connected ? 'กำลังโหลด…' : 'กำลังเชื่อมต่อเซิร์ฟเวอร์…'}</p>
      </div>
    );
  }

  const join = async (name: string, color: string) => {
    try {
      const res = await api<{ id: string }>('POST', '/api/join', { id: view.me?.id, name, color });
      save(ID_KEY, res.id);
      setEditing(false);
      refresh();
      return null;
    } catch (e) {
      return e instanceof ApiError ? e.message : 'เชื่อมต่อไม่ได้ กรุณาลองใหม่';
    }
  };

  const answer = async (choice: Choice) => {
    // Show the pick at once; the next poll confirms what the server accepted.
    setView((v) => (v ? { ...v, myAnswer: choice } : v));
    await api('POST', '/api/answer', { id: view.me?.id, choice }).catch(() => {});
    refresh();
  };

  const me = view.me;
  if (!me || (editing && view.phase === 'lobby')) {
    return <Profile pin={view.pin} me={me} phase={view.phase} onSubmit={join} />;
  }

  switch (view.phase) {
    case 'lobby':
      return <Lobby view={view} me={me} onEdit={() => setEditing(true)} />;
    case 'question':
      return <QuestionScreen view={view} me={me} onAnswer={answer} />;
    case 'result':
      if (showStandings) return <Standings view={view} me={me} onBack={() => setShowStandings(false)} />;
      if (me.alive) return <Survived view={view} me={me} />;
      return <Eliminated view={view} me={me} onStandings={() => setShowStandings(true)} />;
    case 'finished':
      return <Winner view={view} me={me} />;
  }
}
