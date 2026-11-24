import { useCallback, useEffect, useState } from 'react';
import type { AdminView } from '../../shared/types';
import { api, ApiError, getToken, setToken } from '../lib/api';
import { syncClock } from '../lib/clock';
import { usePoll } from '../lib/poll';
import { linkTo, navigate } from '../lib/router';
import { Control } from './Control';
import { AdminHeader } from './AdminHeader';
import { History } from './History';
import { Login } from './Login';
import { Questions } from './Questions';
import { Settings } from './Settings';

type Auth = 'checking' | 'out' | 'in';

const POLL_MS = 1000;

export function AdminApp({ path }: { path: string }) {
  const [auth, setAuth] = useState<Auth>(getToken() ? 'checking' : 'out');
  const [passwordIsDefault, setPasswordIsDefault] = useState(false);
  const [view, setView] = useState<AdminView | null>(null);

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

  const refresh = usePoll(
    () => api<AdminView>('GET', '/api/admin/state'),
    (v) => {
      syncClock(v.serverNow);
      setView(v);
    },
    // A 401 means the session expired or was revoked (password changed elsewhere).
    (err) => {
      if (err instanceof ApiError && err.status === 401) signOut();
    },
    POLL_MS,
    auth === 'in',
  );

  /** Runs a game action, e.g. emit('admin:start', ack) or emit('admin:settings', { shuffle: true }). */
  const emit = useCallback(
    async (event: string, ...args: unknown[]) => {
      const ack = args.find((a) => typeof a === 'function') as ((err: string | null) => void) | undefined;
      const payload = args.find((a) => typeof a !== 'function') ?? {};
      try {
        const res = await api<{ error: string | null }>('POST', `/api/admin/action/${event.replace(/^admin:/, '')}`, payload);
        ack?.(res.error);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) signOut();
        ack?.(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด');
      }
      refresh();
    },
    [refresh, signOut],
  );

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
