import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Choice, PlayerView } from '../../shared/types';
import { syncClock } from '../lib/clock';
import { load, save } from '../lib/storage';
import { Eliminated } from './Eliminated';
import { Lobby } from './Lobby';
import { Profile } from './Profile';
import { QuestionScreen } from './QuestionScreen';
import { Standings } from './Standings';
import { Survived } from './Survived';
import { Winner } from './Winner';

const ID_KEY = 'minvoice.playerId';

export function PlayerApp() {
  const socketRef = useRef<Socket | null>(null);
  const [view, setView] = useState<PlayerView | null>(null);
  const [connected, setConnected] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showStandings, setShowStandings] = useState(false);

  useEffect(() => {
    const socket = io();
    socketRef.current = socket;
    socket.on('connect', () => {
      setConnected(true);
      socket.emit('player:resume', load(ID_KEY));
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('state', (v: PlayerView) => {
      syncClock(v.serverNow);
      setView(v);
    });
    return () => {
      socket.disconnect();
    };
  }, []);

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

  const join = (name: string, color: string) =>
    new Promise<string | null>((resolve) => {
      socketRef.current?.emit(
        'player:join',
        { id: view.me?.id, name, color },
        (res: { id?: string; error?: string }) => {
          if (res.id) {
            save(ID_KEY, res.id);
            setEditing(false);
          }
          resolve(res.error ?? null);
        },
      );
    });

  const answer = (choice: Choice) => socketRef.current?.emit('player:answer', choice);

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
