import { useState } from 'react';
import { api } from '../lib/api';

const PASSWORD_MIN = 8;

interface Props {
  passwordIsDefault: boolean;
  onChanged: () => void;
}

export function Settings({ passwordIsDefault, onChanged }: Props) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDone(false);
    if (next.length < PASSWORD_MIN) {
      setError(`รหัสผ่านใหม่ต้องยาวอย่างน้อย ${PASSWORD_MIN} ตัวอักษร`);
      return;
    }
    if (next !== confirm) {
      setError('ยืนยันรหัสผ่านใหม่ไม่ตรงกัน');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api('POST', '/api/admin/password', { current, next });
      setCurrent('');
      setNext('');
      setConfirm('');
      setDone(true);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h1 className="page-title">ตั้งค่า</h1>
        <p className="meta" style={{ margin: 0, fontSize: 14 }}>
          จัดการรหัสผ่านสำหรับเข้าหลังบ้าน
        </p>
      </div>

      <form className="card form narrow" onSubmit={submit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>เปลี่ยนรหัสผ่านแอดมิน</h2>
          <p className="meta" style={{ margin: 0, lineHeight: 1.6 }}>
            {passwordIsDefault
              ? 'ตอนนี้ยังใช้รหัสผ่านเริ่มต้น "changeme" ควรเปลี่ยนเป็นรหัสที่คาดเดายาก'
              : 'เมื่อเปลี่ยนแล้ว อุปกรณ์อื่นที่เข้าสู่ระบบไว้จะถูกออกจากระบบ'}
          </p>
        </div>
        <div className="field">
          <label htmlFor="cur">รหัสผ่านปัจจุบัน</label>
          <input
            id="cur"
            className="input"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="new">รหัสผ่านใหม่</label>
          <input
            id="new"
            className="input"
            type="password"
            autoComplete="new-password"
            minLength={PASSWORD_MIN}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            aria-describedby="new-hint"
            required
          />
          <span id="new-hint" className="meta">
            อย่างน้อย {PASSWORD_MIN} ตัวอักษร
          </span>
        </div>
        <div className="field">
          <label htmlFor="confirm">ยืนยันรหัสผ่านใหม่</label>
          <input
            id="confirm"
            className="input"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </div>
        {error && <p className="error">{error}</p>}
        {done && <p className="success">เปลี่ยนรหัสผ่านเรียบร้อยแล้ว</p>}
        <div>
          <button type="submit" className="btn btn-sm" disabled={busy}>
            บันทึกรหัสผ่านใหม่
          </button>
        </div>
      </form>
    </>
  );
}
