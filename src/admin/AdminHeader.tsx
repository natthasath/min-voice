import { useState } from 'react';
import { Check, Copy } from '../components/Icons';
import { Logo } from '../components/Logo';
import { linkTo } from '../lib/router';

const NAV = [
  { path: '/admin', label: 'ควบคุมเกม' },
  { path: '/admin/questions', label: 'คลังคำถาม' },
  { path: '/admin/history', label: 'ประวัติเกม' },
  { path: '/admin/settings', label: 'ตั้งค่า' },
];

interface Props {
  path: string;
  pin: string | null;
  onLogout: () => void;
}

export function AdminHeader({ path, pin, onLogout }: Props) {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(location.origin + '/');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked — nothing else to do
    }
  };

  return (
    <header className="admin-header">
      <div className="admin-header-inner">
        <Logo label="Min Voice · Admin" />
        <nav aria-label="เมนูแอดมิน" className="admin-nav">
          {NAV.map((n) => (
            <a
              key={n.path}
              href={n.path}
              onClick={linkTo(n.path)}
              aria-current={path === n.path ? 'page' : undefined}
            >
              {n.label}
            </a>
          ))}
        </nav>
        <div className="spacer" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {pin && (
            <>
              <span className="meta">PIN ห้อง</span>
              <span className="pin">
                {pin.slice(0, 3)} {pin.slice(3)}
              </span>
              <button
                type="button"
                className="icon-btn"
                aria-label={copied ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์เข้าห้อง'}
                title={copied ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์เข้าห้อง'}
                onClick={copyLink}
              >
                {copied ? <Check size={18} width={2} /> : <Copy />}
              </button>
            </>
          )}
          <button type="button" className="btn btn-outline btn-sm" style={{ height: 44 }} onClick={onLogout}>
            ออกจากระบบ
          </button>
        </div>
      </div>
    </header>
  );
}
