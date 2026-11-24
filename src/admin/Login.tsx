import { useState } from 'react';
import { Logo } from '../components/Logo';
import { api, setToken } from '../lib/api';

export function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { token } = await api<{ token: string }>('POST', '/api/admin/login', { password });
      setToken(token);
      onLogin();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="admin login">
      <form className="card form" onSubmit={submit}>
        <Logo label="Min Voice · Admin" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 className="page-title" style={{ fontSize: 24 }}>
            เข้าสู่ระบบหลังบ้าน
          </h1>
          <p className="meta" style={{ margin: 0 }}>
            สำหรับผู้ดูแลเกมเท่านั้น
          </p>
        </div>
        <div className="field">
          <label htmlFor="pw">รหัสผ่าน</label>
          <input
            id="pw"
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        </div>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn btn-md" disabled={busy || !password}>
          เข้าสู่ระบบ
        </button>
      </form>
    </div>
  );
}
