import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { AdminView } from '../../shared/types';
import { api, ApiError, getToken, setToken } from '../lib/api';
import { syncClock } from '../lib/clock';
import { linkTo, navigate } from '../lib/router';
import { Control } from './Control';
import { AdminHeader } from './AdminHeader';
import { History } from './History';
import { Login } from './Login';
import { Questions } from './Questions';
import { Settings } from './Settings';

type Auth = 'checking' | 'out' | 'in';

export function AdminApp({ path }: { path: string }) {
  const [auth, setAuth] = useState<Auth>(getToken() ? 'checking' : 'out');
  const [passwordIsDefault, setPasswordIsDefault] = useState(false);
  const [view, setView] = useState<AdminView | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const signOut = useCallback(() => {
    setToken(null);
    setAuth('out');
    setView(null);
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const me = await api<{ passwordIsDefault: boolean }>('GET', '/api/admin/me');
      setPasswordIsDefault(me.passwordIsDefault);
      setAuth('in');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) signOut();
    }
  }, [signOut]);

  useEffect(() => {
    if (auth === 'checking') refreshMe();
  }, [auth, refreshMe]);

  useEffect(() => {
    if (auth !== 'in') return;
    const socket = io('/admin', { auth: { token: getToken() } });
    socketRef.current = socket;
    socket.on('state', (v: AdminView) => {
      syncClock(v.serverNow);
      setView(v);
    });
    socket.on('connect_error', (err) => {
      if (err.message === 'unauthorized') signOut();
    });
    socket.on('disconnect', (reason) => {
      // The server drops admin sockets whose session was revoked (password changed elsewhere).
      if (reason === 'io server disconnect') refreshMe();
    });
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [auth, signOut, refreshMe]);

  const emit = useCallback((event: string, ...args: unknown[]) => {
    socketRef.current?.emit(event, ...args);
  }, []);

  const logout = async () => {
    await api('POST', '/api/admin/logout').catch(() => {});
    signOut();
    navigate('/admin');
  };

  if (auth === 'checking') return <div className="admin" />;
  if (auth === 'out') return <Login onLogin={() => setAuth('checking')} />;

  const page = path.replace(/\/+$/, '') || '/admin';

  return (
    <div className="admin">
      <AdminHeader path={page} pin={view?.pin ?? null} onLogout={logout} />
      <main className="admin-main">
        {passwordIsDefault && page !== '/admin/settings' && (
          <div className="banner" role="status">
            <span>
              ยังใช้รหัสผ่านแอดมินเริ่มต้น (<b>changeme</b>) อยู่ ควรเปลี่ยนก่อนเปิดให้ผู้เล่นเข้า
            </span>
            <a href="/admin/settings" onClick={linkTo('/admin/settings')}>
              เปลี่ยนรหัสผ่าน
            </a>
          </div>
        )}
        {page === '/admin/questions' ? (
          <Questions onUnauthorized={signOut} />
        ) : page === '/admin/history' ? (
          <History onUnauthorized={signOut} />
        ) : page === '/admin/settings' ? (
          <Settings passwordIsDefault={passwordIsDefault} onChanged={() => setPasswordIsDefault(false)} />
        ) : view ? (
          <Control view={view} emit={emit} />
        ) : (
          <p className="meta">กำลังเชื่อมต่อ…</p>
        )}
      </main>
    </div>
  );
}
