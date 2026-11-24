import { useEffect, useState } from 'react';
import type { HistoryEntry } from '../../shared/types';
import { api, ApiError } from '../lib/api';

const fmt = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' });

export function History({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [rows, setRows] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<HistoryEntry[]>('GET', '/api/admin/history')
      .then(setRows)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) onUnauthorized();
        else setError(e.message);
      });
  }, [onUnauthorized]);

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h1 className="page-title">ประวัติเกม</h1>
        <p className="meta" style={{ margin: 0, fontSize: 14 }}>
          ผลของเกมที่จบแล้ว ล่าสุดอยู่บนสุด
        </p>
      </div>

      {error && <p className="error">{error}</p>}

      <section className="card">
        {!rows ? (
          <div className="empty">กำลังโหลด…</div>
        ) : rows.length === 0 ? (
          <div className="empty">ยังไม่มีเกมที่จบ</div>
        ) : (
          <div className="table-wrap">
            <table className="history">
              <thead>
                <tr>
                  <th scope="col">จบเมื่อ</th>
                  <th scope="col">ผู้ชนะ</th>
                  <th scope="col">รอบ</th>
                  <th scope="col">ผู้เล่น</th>
                  <th scope="col">อันดับ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmt.format(r.endedAt)}</td>
                    <td style={{ fontWeight: 600 }}>{r.winners.join(', ') || '—'}</td>
                    <td>{r.rounds}</td>
                    <td>{r.players}</td>
                    <td className="meta" style={{ fontSize: 13, lineHeight: 1.6 }}>
                      {r.top.map((t) => `${t.rank}. ${t.name} (${t.label})`).join(' · ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
